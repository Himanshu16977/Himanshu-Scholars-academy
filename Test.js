const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true,
  },
  options: {
    type: [String],
    required: [true, 'Four options are required'],
    validate: {
      validator: function (val) {
        return Array.isArray(val) && val.length >= 2;
      },
      message: 'Question must have at least 2 options (standard is 4 options)',
    },
  },
  correctAnswer: {
    type: Number,
    required: [true, 'Correct option index (0-3) is required'],
    min: 0,
  },
  explanation: {
    type: String,
    default: '',
    trim: true,
  },
  marks: {
    type: Number,
    default: 4,
    min: 1,
  },
  negativeMarks: {
    type: Number,
    default: 1,
    min: 0,
  },
});

const testSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Test title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      default: 'General',
    },
    category: {
      type: String,
      trim: true,
      default: 'CBSE / Board',
    },
    duration: {
      type: Number,
      required: [true, 'Duration in minutes is required'],
      default: 30, // in minutes
      min: 1,
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    passingPercentage: {
      type: Number,
      default: 40,
      min: 0,
      max: 100,
    },
    negativeMarking: {
      type: Boolean,
      default: false,
    },
    negativeMarksPerQuestion: {
      type: Number,
      default: 1,
    },
    marksPerQuestion: {
      type: Number,
      default: 4,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
    },
    isAllIndia: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    questions: [questionSchema],
  },
  {
    timestamps: true,
  }
);

// Auto-calculate total marks before saving if questions are present
testSchema.pre('save', function (next) {
  if (this.questions && this.questions.length > 0) {
    this.totalMarks = this.questions.reduce((sum, q) => sum + (q.marks || this.marksPerQuestion || 4), 0);
  } else {
    this.totalMarks = 0;
  }
  next();
});

module.exports = mongoose.model('Test', testSchema);
