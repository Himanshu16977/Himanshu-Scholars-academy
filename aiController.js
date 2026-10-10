const TestResult = require('../models/TestResult');
const {
  askStudyAssistant,
  generateQuiz,
  detectWeakTopicsFromResults,
  generateStudyPlan,
  explainConcept,
} = require('../utils/aiService');

// ─────────────────────────────────────────────────────────────
// 1. AI STUDY ASSISTANT
// ─────────────────────────────────────────────────────────────
// @desc    Ask a study question and receive personalized explanation
// @route   POST /api/ai/study-assistant
// @access  Private (Student, Teacher, Admin)
const handleStudyAssistant = async (req, res) => {
  try {
    const { question, subject, gradeLevel, history } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a study question or doubt',
      });
    }

    const response = await askStudyAssistant({
      question: question.trim(),
      subject: subject || 'General',
      gradeLevel: gradeLevel || 'Class 10-12',
      history: history || [],
    });

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('AI Study Assistant Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to process study question with AI assistant',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 2. AI QUIZ GENERATOR
// ─────────────────────────────────────────────────────────────
// @desc    Generate MCQ quiz with options, answers, and explanations
// @route   POST /api/ai/quiz-generator
// @access  Private (Student, Teacher, Admin)
const handleQuizGenerator = async (req, res) => {
  try {
    const {
      subject = 'Science',
      topic = 'Electricity',
      difficulty = 'Medium',
      numQuestions = 5,
    } = req.body;

    if (!topic || !topic.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please specify a quiz topic',
      });
    }

    const questions = await generateQuiz({
      subject: subject.trim(),
      topic: topic.trim(),
      difficulty,
      numQuestions: parseInt(numQuestions, 10) || 5,
    });

    res.status(200).json({
      success: true,
      meta: {
        subject,
        topic,
        difficulty,
        totalQuestions: questions.length,
      },
      data: questions,
    });
  } catch (error) {
    console.error('AI Quiz Generator Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate quiz questions',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 3. WEAK TOPIC DETECTION
// ─────────────────────────────────────────────────────────────
// @desc    Analyze student's test results and identify practice areas
// @route   GET /api/ai/weak-topics
// @access  Private (Student, Teacher, Admin)
const handleWeakTopicDetection = async (req, res) => {
  try {
    const studentId = req.user._id;

    // Fetch all test results submitted by this student
    const testResults = await TestResult.find({ student: studentId })
      .sort({ createdAt: -1 })
      .limit(20);

    const analysis = detectWeakTopicsFromResults(testResults);

    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('Weak Topic Detection Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze test results for weak topics',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 4. SMART STUDY PLANNER
// ─────────────────────────────────────────────────────────────
// @desc    Generate a custom daily & weekly study timetable
// @route   POST /api/ai/study-planner
// @access  Private (Student, Teacher, Admin)
const handleStudyPlanner = async (req, res) => {
  try {
    const { examDate, subjects, dailyHours } = req.body;

    if (!examDate) {
      return res.status(400).json({
        success: false,
        message: 'Exam date is required to generate study timetable',
      });
    }

    const plan = await generateStudyPlan({
      examDate,
      subjects: Array.isArray(subjects) && subjects.length > 0 ? subjects : ['Mathematics', 'Science'],
      dailyHours: parseFloat(dailyHours) || 3,
    });

    res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error('Study Planner Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate smart study schedule',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 5. AI EXPLANATION MODULE
// ─────────────────────────────────────────────────────────────
// @desc    Explain any formula, theorem, question or concept
// @route   POST /api/ai/explain
// @access  Private (Student, Teacher, Admin)
const handleExplainConcept = async (req, res) => {
  try {
    const { topicOrProblem, context, detailLevel } = req.body;

    if (!topicOrProblem || !topicOrProblem.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a concept, theorem, or question to explain',
      });
    }

    const explanation = await explainConcept({
      topicOrProblem: topicOrProblem.trim(),
      context: context ? context.trim() : '',
      detailLevel: detailLevel || 'eli5',
    });

    res.status(200).json({
      success: true,
      data: explanation,
    });
  } catch (error) {
    console.error('AI Explanation Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate explanation',
    });
  }
};

module.exports = {
  handleStudyAssistant,
  handleQuizGenerator,
  handleWeakTopicDetection,
  handleStudyPlanner,
  handleExplainConcept,
};
