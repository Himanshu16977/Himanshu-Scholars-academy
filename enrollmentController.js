const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');

// @desc    Enroll authenticated student in a course
// @route   POST /api/enrollments/:courseId
// @access  Private (Student, Admin)
const enrollInCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user._id;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      course: courseId,
    });

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'You are already enrolled in this course',
        enrollment: existingEnrollment,
      });
    }

    // Create enrollment
    const enrollment = await Enrollment.create({
      student: studentId,
      course: courseId,
      progress: 0,
    });

    // Auto record payment transaction for accounting
    try {
      const Payment = require('../models/Payment');
      const txId = 'TXN-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);
      const invNum = 'HSA-INV-' + Math.floor(100000 + Math.random() * 900000);
      await Payment.create({
        student: studentId,
        course: courseId,
        amount: course.price || 0,
        paymentMethod: (course.price || 0) === 0 ? 'Cash / Offline' : 'UPI',
        transactionId: txId,
        invoiceNumber: invNum,
        status: 'completed',
        remarks: `Course enrollment: ${course.title}`,
      });
    } catch (payErr) {
      console.warn('Auto payment record notice:', payErr.message);
    }

    const populated = await Enrollment.findById(enrollment._id)
      .populate('course')
      .populate('student', 'name email');

    res.status(201).json({
      success: true,
      message: `Enrolled successfully in ${course.title}!`,
      data: populated,
    });
  } catch (error) {
    console.error('Enrollment Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error processing enrollment',
    });
  }
};

// @desc    Get enrolled courses for logged in student
// @route   GET /api/enrollments/my
// @access  Private (Student, Admin)
const getMyEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ student: req.user._id })
      .populate({
        path: 'course',
        populate: {
          path: 'instructor',
          select: 'name email profileImage',
        },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: enrollments.length,
      data: enrollments,
    });
  } catch (error) {
    console.error('Get My Enrollments Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving enrolled courses',
    });
  }
};

// @desc    Check if current student is enrolled in a specific course
// @route   GET /api/enrollments/check/:courseId
// @access  Private
const checkEnrollmentStatus = async (req, res) => {
  try {
    const { courseId } = req.params;
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
    });

    res.status(200).json({
      success: true,
      isEnrolled: Boolean(enrollment),
      enrollment: enrollment || null,
    });
  } catch (error) {
    console.error('Check Enrollment Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error checking enrollment status',
    });
  }
};

// @desc    Update completed lessons and progress for an enrolled course
// @route   PUT /api/enrollments/:courseId/progress
// @access  Private (Student, Admin)
const updateProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { lessonId, completed, chapterId } = req.body;

    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
    });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment record not found',
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    if (lessonId) {
      const lessonObjId = lessonId.toString();
      const idx = enrollment.completedLessons.findIndex(
        (id) => id.toString() === lessonObjId
      );
      if (completed && idx === -1) {
        enrollment.completedLessons.push(lessonId);
      } else if (!completed && idx !== -1) {
        enrollment.completedLessons.splice(idx, 1);
      }
    }

    // Count total lessons (flat + chapter-based)
    const flatCount = course.lessons?.length || 0;
    const chapterCount = course.chapters
      ? course.chapters.reduce((s, ch) => s + (ch.lessons?.length || 0), 0)
      : 0;
    const totalLessons = flatCount + chapterCount || 1;

    enrollment.progress = Math.min(
      100,
      Math.round((enrollment.completedLessons.length / totalLessons) * 100)
    );

    if (enrollment.progress === 100) {
      enrollment.status = 'completed';
    } else {
      enrollment.status = 'active';
    }

    // Update lastWatched for continue-learning
    if (lessonId) {
      enrollment.lastWatched = {
        chapterId: chapterId || null,
        lessonId,
      };
    }

    await enrollment.save();

    res.status(200).json({
      success: true,
      message: 'Progress updated successfully',
      data: enrollment,
    });
  } catch (error) {
    console.error('Update Progress Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating course progress',
    });
  }
};


// @desc    Unenroll from course
// @route   DELETE /api/enrollments/:courseId
// @access  Private (Student, Admin)
const unenrollFromCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const enrollment = await Enrollment.findOneAndDelete({
      student: req.user._id,
      course: courseId,
    });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Unenrolled from course successfully',
    });
  } catch (error) {
    console.error('Unenroll Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error unenrolling from course',
    });
  }
};

// @desc    Get all enrollments across academy
// @route   GET /api/enrollments/admin/all
// @access  Private (Admin only)
const getAllEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find()
      .populate('student', 'name email phone')
      .populate('course', 'title category price instructor')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: enrollments.length,
      data: enrollments,
    });
  } catch (error) {
    console.error('Get All Enrollments Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving all enrollments',
    });
  }
};

module.exports = {
  enrollInCourse,
  getMyEnrollments,
  checkEnrollmentStatus,
  updateProgress,
  unenrollFromCourse,
  getAllEnrollments,
};
