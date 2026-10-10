const mongoose = require('mongoose');

const testResultAnswerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  questionText: {
    type: String,
    required: true,
  },
  options: [{
    type: String,
  }],
  selectedOption: {
    type: Number,
    default: -1, // -1 means unattempted / skipped
  },
  correctOption: {
    type: Number,
    required: true,
  },
  isCorrect: {
    type: Boolean,
    default: false,
  },
  marksObtained: {
    type: Number,
    default: 0,
  },
  explanation: {
    type: String,
    default: '',
  },
});

const testResultSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Test',
      required: true,
    },
    testTitle: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      default: 'General',
    },
    category: {
      type: String,
      default: '',
    },
    answers: [testResultAnswerSchema],
    totalQuestions: {
      type: Number,
      required: true,
    },
    attemptedQuestions: {
      type: Number,
      required: true,
    },
    correctAnswers: {
      type: Number,
      required: true,
    },
    wrongAnswers: {
      type: Number,
      required: true,
    },
    unanswered: {
      type: Number,
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
    maxScore: {
      type: Number,
      required: true,
    },
    percentage: {
      type: Number,
      required: true,
    },
    passed: {
      type: Boolean,
      default: false,
    },
    timeTakenSeconds: {
      type: Number,
      default: 0,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('TestResult', testResultSchema);
