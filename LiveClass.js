const mongoose = require('mongoose');

const liveClassSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Class title is required'],
      trim: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: false,
    },
    courseTitle: {
      type: String,
      default: 'General Academic Session',
      trim: true,
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    instructorName: {
      type: String,
      default: '',
    },
    date: {
      type: String,
      required: [true, 'Date is required (e.g. Today, Tomorrow, Oct 15)'],
    },
    time: {
      type: String,
      required: [true, 'Time slot is required (e.g. 5:00 PM - 6:30 PM)'],
    },
    duration: {
      type: String,
      default: '60 mins',
    },
    meetingUrl: {
      type: String,
      default: 'https://meet.google.com/hsa-live',
      trim: true,
    },
    status: {
      type: String,
      enum: ['upcoming', 'live', 'completed', 'cancelled'],
      default: 'upcoming',
    },
    studentsJoined: {
      type: Number,
      default: 0,
    },
    totalStudents: {
      type: Number,
      default: 35,
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LiveClass', liveClassSchema);
