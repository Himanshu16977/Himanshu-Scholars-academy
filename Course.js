const mongoose = require('mongoose');

// ── Resource Schema ────────────────────────────────────────
const resourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  type: { type: String, enum: ['pdf', 'doc', 'link', 'other'], default: 'link' },
});

// ── Lesson Schema ──────────────────────────────────────────
const lessonSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a lesson title'],
    trim: true,
  },
  description: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  duration: { type: String, default: '45 mins' },
  order: { type: Number, default: 1 },
  resources: [resourceSchema],
  createdAt: { type: Date, default: Date.now },
});

// ── Chapter Schema ─────────────────────────────────────────
const chapterSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a chapter title'],
    trim: true,
  },
  description: { type: String, default: '' },
  order: { type: Number, default: 1 },
  lessons: [lessonSchema],
  createdAt: { type: Date, default: Date.now },
});

// ── Course Schema ──────────────────────────────────────────
const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a course title'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: {
      type: String,
      required: [true, 'Please provide a course description'],
    },
    category: {
      type: String,
      required: [true, 'Please specify a course category'],
      trim: true,
    },
    thumbnail: {
      type: String,
      default: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60',
    },
    price: {
      type: Number,
      required: [true, 'Please provide a course price'],
      default: 0,
      min: [0, 'Price cannot be negative'],
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Course must have an assigned instructor'],
    },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'All Levels'],
      default: 'All Levels',
    },
    duration: { type: String, default: '3 Months' },
    // Legacy flat lessons (backward compat)
    lessons: [lessonSchema],
    // Chapter-based curriculum
    chapters: [chapterSchema],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Virtual: total lessons across chapters
courseSchema.virtual('lessonCount').get(function () {
  const flat = this.lessons ? this.lessons.length : 0;
  const nested = this.chapters
    ? this.chapters.reduce((s, ch) => s + (ch.lessons ? ch.lessons.length : 0), 0)
    : 0;
  return flat + nested;
});

const Course = mongoose.model('Course', courseSchema);

module.exports = Course;
