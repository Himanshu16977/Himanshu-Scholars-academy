const TestResult = require('../models/TestResult');

// In-memory / initial seed data generator for student dashboard features
// Seamlessly connects with User data and provides full live interactivity

let doubtsDatabase = [
  {
    id: 'dbt-101',
    subject: 'Physics',
    topic: 'Electromagnetic Induction & Lenz Law',
    question: 'Why does the direction of induced current always oppose the change in magnetic flux that produces it according to energy conservation?',
    answer: 'According to conservation of energy, work must be done against the opposing force to generate electrical energy. If the induced current assisted the flux change, energy would be created from nothing, violating the First Law of Thermodynamics.',
    teacherName: 'Dr. Neha Sen (Senior Physics Faculty)',
    status: 'resolved',
    askedAt: '2026-09-28T14:30:00.000Z',
    answeredAt: '2026-09-28T17:15:00.000Z',
  },
  {
    id: 'dbt-102',
    subject: 'Mathematics',
    topic: 'Definite Integrals - Leibniz Rule',
    question: 'How do we differentiate an integral whose limits are also variable functions of x?',
    answer: 'Apply Leibniz Integral Rule: d/dx [∫_{u(x)}^{v(x)} f(t) dt] = f(v(x))·v\'(x) - f(u(x))·u\'(x). Ensure f(t) is continuous over the interval.',
    teacherName: 'Prof. Himanshu (Dean of Mathematics)',
    status: 'resolved',
    askedAt: '2026-09-29T10:15:00.000Z',
    answeredAt: '2026-09-29T11:45:00.000Z',
  },
  {
    id: 'dbt-103',
    subject: 'Chemistry',
    topic: 'Coordination Compounds - Crystal Field Theory',
    question: 'How do we predict whether an octahedral complex will be high-spin or low-spin using spectrochemical series?',
    answer: '',
    teacherName: 'Faculty assigned: Dr. Rajesh Roy',
    status: 'pending',
    askedAt: '2026-09-30T18:00:00.000Z',
    answeredAt: null,
  }
];

// @desc    Get complete student dashboard data
// @route   GET /api/student/dashboard
// @access  Private (Student & Admin)
const getStudentDashboard = async (req, res) => {
  try {
    const student = req.user;

    // Fetch real test results from MongoDB for this student
    const dbTestResults = await TestResult.find({ student: student._id })
      .populate('test', 'title subject duration')
      .sort({ createdAt: -1 })
      .limit(10);

    const formattedDbTests = dbTestResults.map((r, idx) => ({
      id: r._id.toString(),
      resultId: r._id.toString(),
      testId: r.test?._id?.toString(),
      title: r.testTitle || r.test?.title || 'Academic Assessment',
      course: r.subject || 'General Studies',
      score: r.score,
      maxScore: r.maxScore,
      percentage: r.percentage,
      totalQuestions: r.totalQuestions,
      correctAnswers: r.correctAnswers,
      wrongAnswers: r.wrongAnswers,
      passed: r.passed,
      rank: r.percentage >= 90 ? 'Top 5%' : r.percentage >= 75 ? 'Top 15%' : 'Top 35%',
      date: new Date(r.submittedAt || r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      status: 'graded',
      feedback: r.passed ? 'Excellent performance! Good accuracy and problem solving.' : 'Needs revision on missed concepts. Review full solution review.',
    }));

    const avgScoreVal = dbTestResults.length > 0
      ? (dbTestResults.reduce((sum, r) => sum + r.percentage, 0) / dbTestResults.length).toFixed(1) + '%'
      : '89.4%';

    const dashboardData = {
      studentInfo: {
        id: student._id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        role: student.role,
        avatar: student.profileImage,
        enrollmentId: `HSA-${student._id.toString().slice(-6).toUpperCase()}`,
        academicYear: '2026-2027',
      },
      stats: {
        totalEnrolledCourses: 3,
        completedLessons: 52,
        totalLessons: 74,
        averageTestScore: avgScoreVal,
        learningProgress: 70, // in percent
        upcomingClassCountdown: 'Today at 5:00 PM',
      },
      upcomingClasses: [
        {
          id: 'cls-1',
          title: 'Wave Optics & Young Double Slit Experiment',
          course: 'Class 12 Advanced Physics',
          instructor: 'Dr. Neha Sen',
          date: 'Today',
          time: '5:00 PM - 6:30 PM',
          isLive: true,
          meetingUrl: 'https://meet.google.com/hsa-phy-12',
          roomCode: 'OPTICS-101',
        },
        {
          id: 'cls-2',
          title: 'Integration by Parts & Partial Fractions',
          course: 'Class 12 Higher Mathematics',
          instructor: 'Prof. Himanshu',
          date: 'Tomorrow',
          time: '4:00 PM - 5:30 PM',
          isLive: false,
          meetingUrl: 'https://meet.google.com/hsa-mth-12',
          roomCode: 'CALCULUS-204',
        },
        {
          id: 'cls-3',
          title: 'Chemical Kinetics: Reaction Rates & Arrhenius Equation',
          course: 'JEE Foundation Chemistry',
          instructor: 'Dr. Rajesh Roy',
          date: 'Oct 3, 2026',
          time: '6:00 PM - 7:30 PM',
          isLive: false,
          meetingUrl: 'https://meet.google.com/hsa-chm-11',
          roomCode: 'KINETICS-301',
        }
      ],
      enrolledCourses: [
        {
          id: 'crs-1',
          title: 'Class 12 Higher Mathematics & Calculus Sprint',
          code: 'HSA-MTH-12',
          instructor: 'Prof. Himanshu',
          category: 'Class 12th Board',
          totalLessons: 36,
          completedLessons: 28,
          progress: 78,
          nextLesson: 'Lesson 29: Differential Equations Order & Degree',
          lastAccessed: 'Yesterday',
        },
        {
          id: 'crs-2',
          title: 'Class 12 Advanced Physics Mastery',
          code: 'HSA-PHY-12',
          instructor: 'Dr. Neha Sen',
          category: 'Class 12th Board',
          totalLessons: 30,
          completedLessons: 20,
          progress: 67,
          nextLesson: 'Lesson 21: Interference & Fringe Width Derivation',
          lastAccessed: '2 days ago',
        },
        {
          id: 'crs-3',
          title: 'JEE / NEET Foundation Chemistry Track',
          code: 'HSA-CHM-FND',
          instructor: 'Dr. Rajesh Roy',
          category: 'Competitive Foundations',
          totalLessons: 40,
          completedLessons: 26,
          progress: 65,
          nextLesson: 'Lesson 27: First Order Kinetics Half Life Proofs',
          lastAccessed: '3 days ago',
        }
      ],
      recentTests: formattedDbTests.length > 0 ? formattedDbTests : [
        {
          id: 'tst-1',
          title: 'Calculus Sectional Test Series #4',
          course: 'Higher Mathematics',
          score: 94,
          maxScore: 100,
          percentage: 94,
          rank: '3rd of 240',
          date: 'Sep 27, 2026',
          status: 'graded',
          feedback: 'Exceptional working on integration by substitution. Review definite integral properties.',
        },
        {
          id: 'tst-2',
          title: 'Ray Optics & Optical Instruments Mock #2',
          course: 'Physics Mastery',
          score: 88,
          maxScore: 100,
          percentage: 88,
          rank: '12th of 260',
          date: 'Sep 21, 2026',
          status: 'graded',
          feedback: 'Accurate ray diagrams. Work on lens-maker formula sign conventions.',
        },
        {
          id: 'tst-3',
          title: 'Thermodynamics & Equilibrium Weekly Quiz',
          course: 'Chemistry Track',
          score: 86,
          maxScore: 100,
          percentage: 86,
          rank: '18th of 255',
          date: 'Sep 15, 2026',
          status: 'graded',
          feedback: 'Good conceptual grasp. Avoid calculation errors in Gibbs Free Energy calculations.',
        }
      ],
      studyMaterials: [
        {
          id: 'mat-1',
          title: 'Complete Formula Handbook - Higher Calculus',
          course: 'Mathematics',
          type: 'Formula Sheet',
          format: 'PDF',
          size: '4.2 MB',
          downloadUrl: '#',
          updatedAt: 'Sep 25, 2026',
        },
        {
          id: 'mat-2',
          title: 'Wave Optics: Derivations & Board Solved Questions',
          course: 'Physics',
          type: 'Handwritten Notes',
          format: 'PDF',
          size: '6.8 MB',
          downloadUrl: '#',
          updatedAt: 'Sep 28, 2026',
        },
        {
          id: 'mat-3',
          title: 'Chemical Kinetics & Arrhenius Derivation Guide',
          course: 'Chemistry',
          type: 'Chapter Notes',
          format: 'PDF',
          size: '5.1 MB',
          downloadUrl: '#',
          updatedAt: 'Sep 29, 2026',
        },
        {
          id: 'mat-4',
          title: 'Previous 10 Years Solved Board Papers (2015-2025)',
          course: 'All Subjects',
          type: 'Exam Bank',
          format: 'PDF',
          size: '18.4 MB',
          downloadUrl: '#',
          updatedAt: 'Sep 20, 2026',
        }
      ],
      doubts: doubtsDatabase,
    };

    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    console.error('Student Dashboard API Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving student dashboard data',
    });
  }
};

// @desc    Submit a new doubt
// @route   POST /api/student/doubts
// @access  Private (Student)
const submitDoubt = async (req, res) => {
  try {
    const { subject, topic, question } = req.body;

    if (!subject || !question) {
      return res.status(400).json({
        success: false,
        message: 'Please provide subject and question details',
      });
    }

    const newDoubt = {
      id: `dbt-${Date.now().toString().slice(-4)}`,
      subject: subject.trim(),
      topic: topic ? topic.trim() : 'General Doubt',
      question: question.trim(),
      answer: '',
      teacherName: 'Assigned to Academy Faculty',
      status: 'pending',
      askedAt: new Date().toISOString(),
      answeredAt: null,
    };

    doubtsDatabase.unshift(newDoubt);

    res.status(201).json({
      success: true,
      message: 'Your doubt has been submitted to faculty desk successfully',
      doubt: newDoubt,
    });
  } catch (error) {
    console.error('Submit Doubt Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error submitting doubt',
    });
  }
};

// @desc    Update student profile details
// @route   PUT /api/student/profile
// @access  Private (Student & Admin)
const updateStudentProfile = async (req, res) => {
  try {
    const user = req.user;
    const { name, phone } = req.body;

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Update Profile Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile',
    });
  }
};

module.exports = {
  getStudentDashboard,
  submitDoubt,
  updateStudentProfile,
};
