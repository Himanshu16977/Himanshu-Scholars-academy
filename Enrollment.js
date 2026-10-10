const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student is required for enrollment'],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course is required for enrollment'],
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // IDs of completed lessons (works for both flat and chapter-based)
    completedLessons: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    // Last watched: chapterId + lessonId for continue-learning
    lastWatched: {
      chapterId: { type: mongoose.Schema.Types.ObjectId, default: null },
      lessonId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate enrollments for the same student and course
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

module.exports = Enrollment;

