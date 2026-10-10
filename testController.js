const Test = require('../models/Test');
const TestResult = require('../models/TestResult');

// ==========================================
// 1. STUDENT & PUBLIC TEST METHODS
// ==========================================

// @desc    Get all published tests
// @route   GET /api/tests
// @access  Public / Student
const getPublishedTests = async (req, res) => {
  try {
    const { category, subject, search } = req.query;
    const query = { status: 'published' };

    if (category && category !== 'All') {
      query.category = category;
    }
    if (subject && subject !== 'All') {
      query.subject = subject;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
      ];
    }

    const tests = await Test.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // Return tests with question count without revealing answers
    const safeTests = tests.map((test) => ({
      _id: test._id,
      title: test.title,
      description: test.description,
      subject: test.subject,
      category: test.category,
      duration: test.duration,
      totalMarks: test.totalMarks || (test.questions?.length || 0) * (test.marksPerQuestion || 4),
      marksPerQuestion: test.marksPerQuestion,
      negativeMarking: test.negativeMarking,
      negativeMarksPerQuestion: test.negativeMarksPerQuestion,
      passingPercentage: test.passingPercentage,
      totalQuestions: test.questions?.length || 0,
      isAllIndia: test.isAllIndia,
      createdBy: test.createdBy,
      createdAt: test.createdAt,
    }));

    res.json({
      success: true,
      count: safeTests.length,
      data: safeTests,
    });
  } catch (err) {
    console.error('Error fetching published tests:', err);
    res.status(500).json({ success: false, message: 'Server error loading tests' });
  }
};

// @desc    Get test by ID for taking (Hides correct answers & explanations to prevent cheating)
// @route   GET /api/tests/:id/take
// @access  Private (Student)
const getTestForTaking = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    if (test.status !== 'published' && req.user.role === 'student') {
      return res.status(403).json({ success: false, message: 'This test is not currently published' });
    }

    // Strip out correctAnswer and explanation so student cannot cheat by checking browser devtools network tab
    const sanitizedQuestions = test.questions.map((q) => ({
      _id: q._id,
      questionText: q.questionText,
      options: q.options,
      marks: q.marks || test.marksPerQuestion || 4,
    }));

    res.json({
      success: true,
      data: {
        _id: test._id,
        title: test.title,
        description: test.description,
        subject: test.subject,
        category: test.category,
        duration: test.duration, // in minutes
        totalMarks: test.totalMarks,
        negativeMarking: test.negativeMarking,
        negativeMarksPerQuestion: test.negativeMarksPerQuestion,
        passingPercentage: test.passingPercentage,
        totalQuestions: sanitizedQuestions.length,
        questions: sanitizedQuestions,
      },
    });
  } catch (err) {
    console.error('Error fetching test for taking:', err);
    res.status(500).json({ success: false, message: 'Failed to initialize test session' });
  }
};

// @desc    Submit test answers, calculate results, and save in MongoDB
// @route   POST /api/tests/:id/submit
// @access  Private (Student)
const submitTest = async (req, res) => {
  try {
    const { answers, timeTakenSeconds } = req.body;
    // answers format expected: [{ questionId, selectedOption: 0..3 or -1 }]

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    if (!test.questions || test.questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Test has no questions configured' });
    }

    const studentAnswersMap = {};
    if (Array.isArray(answers)) {
      answers.forEach((ans) => {
        if (ans && ans.questionId) {
          studentAnswersMap[ans.questionId.toString()] = ans.selectedOption;
        }
      });
    }

    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    let totalScore = 0;
    let maxPossibleScore = 0;

    const detailedAnswers = [];

    test.questions.forEach((q) => {
      const qIdStr = q._id.toString();
      const selected = studentAnswersMap[qIdStr] !== undefined ? studentAnswersMap[qIdStr] : -1;
      const qMarks = q.marks || test.marksPerQuestion || 4;
      const qNegMarks = test.negativeMarking ? (q.negativeMarks || test.negativeMarksPerQuestion || 1) : 0;
      maxPossibleScore += qMarks;

      let isCorrect = false;
      let marksEarned = 0;

      if (selected === null || selected === undefined || selected === -1) {
        unansweredCount++;
        marksEarned = 0;
      } else if (Number(selected) === Number(q.correctAnswer)) {
        isCorrect = true;
        correctCount++;
        marksEarned = qMarks;
        totalScore += qMarks;
      } else {
        wrongCount++;
        marksEarned = -qNegMarks;
        totalScore -= qNegMarks;
      }

      detailedAnswers.push({
        questionId: q._id,
        questionText: q.questionText,
        options: q.options,
        selectedOption: selected,
        correctOption: q.correctAnswer,
        isCorrect,
        marksObtained: marksEarned,
        explanation: q.explanation || 'No detailed explanation provided for this question.',
      });
    });

    // Score cannot be less than zero
    const finalScore = Math.max(0, totalScore);
    const percentage = maxPossibleScore > 0 ? Math.round((finalScore / maxPossibleScore) * 100 * 10) / 10 : 0;
    const passed = percentage >= (test.passingPercentage || 40);
    const attemptedCount = correctCount + wrongCount;

    // Save test result in MongoDB
    const testResult = await TestResult.create({
      student: req.user._id,
      test: test._id,
      testTitle: test.title,
      subject: test.subject,
      category: test.category,
      answers: detailedAnswers,
      totalQuestions: test.questions.length,
      attemptedQuestions: attemptedCount,
      correctAnswers: correctCount,
      wrongAnswers: wrongCount,
      unanswered: unansweredCount,
      score: finalScore,
      maxScore: maxPossibleScore,
      percentage,
      passed,
      timeTakenSeconds: timeTakenSeconds || 0,
      submittedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Test submitted and graded successfully!',
      data: testResult,
    });
  } catch (err) {
    console.error('Error submitting test:', err);
    res.status(500).json({ success: false, message: 'Failed to process test submission' });
  }
};

// @desc    Get student's test history
// @route   GET /api/tests/results/my
// @access  Private (Student)
const getMyTestHistory = async (req, res) => {
  try {
    const results = await TestResult.find({ student: req.user._id })
      .populate('test', 'title subject duration category')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (err) {
    console.error('Error loading student test history:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve test history' });
  }
};

// @desc    Get detailed test result by ID
// @route   GET /api/tests/results/:id
// @access  Private
const getTestResultById = async (req, res) => {
  try {
    const result = await TestResult.findById(req.params.id)
      .populate('student', 'name email phone')
      .populate('test', 'title subject duration category totalMarks passingPercentage');

    if (!result) {
      return res.status(404).json({ success: false, message: 'Test result record not found' });
    }

    // Security check: Only the student who took it, or teacher/admin can view
    if (
      req.user.role === 'student' &&
      result.student._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this result' });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Error loading test result by ID:', err);
    res.status(500).json({ success: false, message: 'Failed to load test scorecard' });
  }
};

// ==========================================
// 2. TEACHER & ADMIN MANAGEMENT METHODS
// ==========================================

// @desc    Create new test
// @route   POST /api/tests
// @access  Private (Teacher, Admin)
const createTest = async (req, res) => {
  try {
    const {
      title,
      description,
      subject,
      category,
      duration,
      negativeMarking,
      negativeMarksPerQuestion,
      marksPerQuestion,
      passingPercentage,
      status,
      isAllIndia,
      questions,
    } = req.body;

    if (!title || !subject || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, subject, and duration in minutes',
      });
    }

    const test = await Test.create({
      title,
      description: description || '',
      subject,
      category: category || 'CBSE / Board',
      duration: Number(duration),
      negativeMarking: Boolean(negativeMarking),
      negativeMarksPerQuestion: Number(negativeMarksPerQuestion) || 1,
      marksPerQuestion: Number(marksPerQuestion) || 4,
      passingPercentage: Number(passingPercentage) || 40,
      status: status || 'published',
      isAllIndia: Boolean(isAllIndia),
      createdBy: req.user._id,
      questions: questions || [],
    });

    res.status(201).json({
      success: true,
      message: 'Online test created successfully',
      data: test,
    });
  } catch (err) {
    console.error('Error creating test:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error creating test' });
  }
};

// @desc    Get all tests (for teacher or admin dashboard)
// @route   GET /api/tests/manage/all
// @access  Private (Teacher, Admin)
const getManagedTests = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'teacher') {
      // Teachers view tests they created, or all if preferred
      query.createdBy = req.user._id;
    }

    const tests = await Test.find(query)
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 });

    // Include attempt counts for each test
    const testsWithStats = await Promise.all(
      tests.map(async (t) => {
        const attemptsCount = await TestResult.countDocuments({ test: t._id });
        return {
          ...t.toObject(),
          totalQuestions: t.questions?.length || 0,
          attemptsCount,
        };
      })
    );

    res.json({
      success: true,
      count: testsWithStats.length,
      data: testsWithStats,
    });
  } catch (err) {
    console.error('Error fetching managed tests:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve test directory' });
  }
};

// @desc    Get complete test with questions for editing
// @route   GET /api/tests/:id/detail
// @access  Private (Teacher, Admin)
const getTestDetail = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).populate('createdBy', 'name email');
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    res.json({
      success: true,
      data: test,
    });
  } catch (err) {
    console.error('Error fetching test detail:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch test details' });
  }
};

// @desc    Update test details
// @route   PUT /api/tests/:id
// @access  Private (Teacher, Admin)
const updateTest = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    // Role check: Only test creator or admin can update
    if (req.user.role !== 'admin' && test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this test' });
    }

    const {
      title,
      description,
      subject,
      category,
      duration,
      negativeMarking,
      negativeMarksPerQuestion,
      marksPerQuestion,
      passingPercentage,
      status,
      isAllIndia,
    } = req.body;

    if (title) test.title = title;
    if (description !== undefined) test.description = description;
    if (subject) test.subject = subject;
    if (category) test.category = category;
    if (duration) test.duration = Number(duration);
    if (negativeMarking !== undefined) test.negativeMarking = Boolean(negativeMarking);
    if (negativeMarksPerQuestion !== undefined) test.negativeMarksPerQuestion = Number(negativeMarksPerQuestion);
    if (marksPerQuestion !== undefined) test.marksPerQuestion = Number(marksPerQuestion);
    if (passingPercentage !== undefined) test.passingPercentage = Number(passingPercentage);
    if (status) test.status = status;
    if (isAllIndia !== undefined) test.isAllIndia = Boolean(isAllIndia);

    await test.save();

    res.json({
      success: true,
      message: 'Test settings updated successfully',
      data: test,
    });
  } catch (err) {
    console.error('Error updating test:', err);
    res.status(500).json({ success: false, message: 'Failed to update test' });
  }
};

// @desc    Delete test
// @route   DELETE /api/tests/:id
// @access  Private (Teacher, Admin)
const deleteTest = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    if (req.user.role !== 'admin' && test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this test' });
    }

    await Test.findByIdAndDelete(req.params.id);
    // Optionally clean up test results
    await TestResult.deleteMany({ test: req.params.id });

    res.json({
      success: true,
      message: 'Test and associated attempt records deleted successfully',
    });
  } catch (err) {
    console.error('Error deleting test:', err);
    res.status(500).json({ success: false, message: 'Failed to delete test' });
  }
};

// @desc    Add a question to a test
// @route   POST /api/tests/:id/questions
// @access  Private (Teacher, Admin)
const addQuestion = async (req, res) => {
  try {
    const { questionText, options, correctAnswer, explanation, marks, negativeMarks } = req.body;

    if (!questionText || !options || options.length < 2 || correctAnswer === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Question text, options (at least 2), and correct answer index are required',
      });
    }

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    if (req.user.role !== 'admin' && test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this test' });
    }

    const newQuestion = {
      questionText,
      options: options.map((opt) => opt.trim()),
      correctAnswer: Number(correctAnswer),
      explanation: explanation || '',
      marks: marks ? Number(marks) : (test.marksPerQuestion || 4),
      negativeMarks: negativeMarks !== undefined ? Number(negativeMarks) : (test.negativeMarksPerQuestion || 1),
    };

    test.questions.push(newQuestion);
    await test.save();

    res.status(201).json({
      success: true,
      message: 'Question added to test successfully',
      data: test,
    });
  } catch (err) {
    console.error('Error adding question:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to add question' });
  }
};

// @desc    Edit a question in a test
// @route   PUT /api/tests/:id/questions/:questionId
// @access  Private (Teacher, Admin)
const updateQuestion = async (req, res) => {
  try {
    const { questionText, options, correctAnswer, explanation, marks, negativeMarks } = req.body;

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    if (req.user.role !== 'admin' && test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this test' });
    }

    const question = test.questions.id(req.params.questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found in this test' });
    }

    if (questionText) question.questionText = questionText;
    if (options && Array.isArray(options)) question.options = options.map((opt) => opt.trim());
    if (correctAnswer !== undefined) question.correctAnswer = Number(correctAnswer);
    if (explanation !== undefined) question.explanation = explanation;
    if (marks !== undefined) question.marks = Number(marks);
    if (negativeMarks !== undefined) question.negativeMarks = Number(negativeMarks);

    await test.save();

    res.json({
      success: true,
      message: 'Question updated successfully',
      data: test,
    });
  } catch (err) {
    console.error('Error updating question:', err);
    res.status(500).json({ success: false, message: 'Failed to update question' });
  }
};

// @desc    Delete a question from a test
// @route   DELETE /api/tests/:id/questions/:questionId
// @access  Private (Teacher, Admin)
const deleteQuestion = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    if (req.user.role !== 'admin' && test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this test' });
    }

    const question = test.questions.id(req.params.questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    test.questions.pull(req.params.questionId);
    await test.save();

    res.json({
      success: true,
      message: 'Question deleted from test successfully',
      data: test,
    });
  } catch (err) {
    console.error('Error deleting question:', err);
    res.status(500).json({ success: false, message: 'Failed to delete question' });
  }
};

// @desc    Get student submissions and analytics for a specific test
// @route   GET /api/tests/:id/submissions
// @access  Private (Teacher, Admin)
const getTestSubmissions = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    // Role check: Only test creator or admin can view test submissions
    if (req.user.role !== 'admin' && test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to view submissions for this test' });
    }

    const submissions = await TestResult.find({ test: test._id })
      .populate('student', 'name email phone')
      .sort({ score: -1, percentage: -1 });

    const totalSubmissions = submissions.length;
    const avgScore = totalSubmissions > 0
      ? Math.round(submissions.reduce((s, a) => s + a.score, 0) / totalSubmissions * 10) / 10
      : 0;
    const passCount = submissions.filter((s) => s.passed).length;
    const passRate = totalSubmissions > 0 ? Math.round((passCount / totalSubmissions) * 100) : 0;

    res.json({
      success: true,
      data: {
        testTitle: test.title,
        totalSubmissions,
        avgScore,
        passRate,
        submissions,
      },
    });
  } catch (err) {
    console.error('Error fetching test submissions:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve test submissions' });
  }
};

module.exports = {
  getPublishedTests,
  getTestForTaking,
  submitTest,
  getMyTestHistory,
  getTestResultById,
  createTest,
  getManagedTests,
  getTestDetail,
  updateTest,
  deleteTest,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getTestSubmissions,
};
