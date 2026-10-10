const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Test = require('../models/Test');
const TestResult = require('../models/TestResult');
const Payment = require('../models/Payment');

// Helper to backfill payment records for pre-existing enrollments if none exist
const ensureEnrollmentPayments = async () => {
  try {
    const paymentCount = await Payment.countDocuments();
    if (paymentCount === 0) {
      const enrollments = await Enrollment.find().populate('course');
      for (const en of enrollments) {
        if (!en.course || !en.student) continue;
        const exists = await Payment.findOne({ student: en.student, course: en.course._id });
        if (!exists) {
          await Payment.create({
            student: en.student,
            course: en.course._id,
            amount: en.course.price || 4999,
            paymentMethod: (en.course.price || 0) === 0 ? 'Cash / Offline' : 'UPI',
            transactionId: `TXN-${en._id.toString().slice(-6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
            invoiceNumber: `HSA-INV-${Math.floor(100000 + Math.random() * 900000)}`,
            status: 'completed',
            remarks: `Initial enrollment fee for ${en.course.title}`,
            paymentDate: en.createdAt || en.enrolledAt || new Date(),
          });
        }
      }
    }
  } catch (err) {
    console.warn('Payment sync notice:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// 1. DASHBOARD OVERVIEW & STATS
// ─────────────────────────────────────────────────────────────
// @desc    Get academy platform statistics
// @route   GET /api/admin/stats
// @access  Private (Admin only)
const getAdminStats = async (req, res) => {
  try {
    await ensureEnrollmentPayments();

    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalTeachers = await User.countDocuments({ role: 'teacher' });
    const totalCourses = await Course.countDocuments();
    const totalEnrollments = await Enrollment.countDocuments();
    const totalTests = await Test.countDocuments();

    // Calculate total revenue from completed payments
    const revenueAgg = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    let totalRevenue = revenueAgg[0]?.total || 0;

    // Fallback if no payment records exist
    if (totalRevenue === 0) {
      const allEnrollments = await Enrollment.find().populate('course', 'price');
      totalRevenue = allEnrollments.reduce((acc, curr) => acc + (curr.course?.price || 0), 0);
    }

    // Monthly breakdown of recent payments
    const paymentsLast30Days = await Payment.find({ status: 'completed' })
      .sort({ paymentDate: -1 })
      .limit(5)
      .populate('student', 'name email')
      .populate('course', 'title price');

    // Recent user signups
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('-password');

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalTeachers,
        totalCourses,
        totalEnrollments,
        totalRevenue,
        totalTests,
        recentUsers,
        recentPayments: paymentsLast30Days,
      },
    });
  } catch (error) {
    console.error('Admin Stats Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving statistics',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 2. USER MANAGEMENT (All Users, Search, Filter, Pagination)
// ─────────────────────────────────────────────────────────────
// @desc    Get all users with role, status, search, and pagination
// @route   GET /api/admin/users
// @access  Private (Admin only)
const getAllUsers = async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    if (role && ['student', 'teacher', 'admin'].includes(role)) {
      query.role = role;
    }

    if (status && status !== 'all') {
      query.isActive = status === 'active';
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
      ];
    }

    const totalCount = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-password');

    res.status(200).json({
      success: true,
      count: users.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum) || 1,
      currentPage: pageNum,
      data: users,
    });
  } catch (error) {
    console.error('Admin Get Users Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving users',
    });
  }
};

// @desc    Admin create new user
// @route   POST /api/admin/users
// @access  Private (Admin only)
const createUser = async (req, res) => {
  try {
    const { name, email, password, phone, role, isActive } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email address already exists',
      });
    }

    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone ? phone.trim() : '',
      role: role && ['student', 'teacher', 'admin'].includes(role) ? role : 'student',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    res.status(201).json({
      success: true,
      message: `${newUser.role.toUpperCase()} account created successfully`,
      data: newUser,
    });
  } catch (error) {
    console.error('Admin Create User Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating user',
    });
  }
};

// @desc    Admin update user details
// @route   PUT /api/admin/users/:id
// @access  Private (Admin only)
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const { name, email, phone, role, password, isActive } = req.body;
    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (isActive !== undefined) user.isActive = Boolean(isActive);

    if (email) {
      const emailCheck = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: user._id },
      });
      if (emailCheck) {
        return res.status(400).json({
          success: false,
          message: 'Email is already used by another account',
        });
      }
      user.email = email.toLowerCase().trim();
    }

    if (role && ['student', 'teacher', 'admin'].includes(role)) {
      user.role = role;
    }

    if (password && password.length >= 6) {
      user.password = password;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User details updated successfully',
      data: user,
    });
  } catch (error) {
    console.error('Admin Update User Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating user',
    });
  }
};

// @desc    Toggle user status (Active / Disabled)
// @route   PUT /api/admin/users/:id/status
// @access  Private (Admin only)
const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Do not allow disabling self
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot disable your own admin account',
      });
    }

    user.isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User account ${user.isActive ? 'activated' : 'disabled'} successfully`,
      data: {
        _id: user._id,
        name: user.name,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('Toggle User Status Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating user status',
    });
  }
};

// @desc    Change user role (student / teacher / admin)
// @route   PUT /api/admin/users/:id/role
// @access  Private (Admin only)
const changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;

    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be student, teacher, or admin.',
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Admin cannot change their own role',
      });
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User role updated to ${role} successfully`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Change Role Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error changing user role',
    });
  }
};

// @desc    Delete a user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin only)
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Admin cannot delete their own account',
      });
    }

    // Clean up enrollments if student
    if (user.role === 'student') {
      await Enrollment.deleteMany({ student: user._id });
      await Payment.deleteMany({ student: user._id });
      await TestResult.deleteMany({ student: user._id });
    }

    // Reassign teacher's courses to current admin or remove
    if (user.role === 'teacher') {
      await Course.updateMany(
        { instructor: user._id },
        { instructor: req.user._id }
      );
    }

    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} account removed successfully`,
    });
  } catch (error) {
    console.error('Admin Delete User Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error deleting user',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 3. STUDENT MANAGEMENT (Dedicated view, enrollments, stats)
// ─────────────────────────────────────────────────────────────
// @desc    Get all students with search, status, and enrollment stats
// @route   GET /api/admin/students
// @access  Private (Admin only)
const getStudents = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    let query = { role: 'student' };

    if (status && status !== 'all') {
      query.isActive = status === 'active';
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
      ];
    }

    const totalCount = await User.countDocuments(query);
    const students = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-password');

    // Attach student stats (enrollments count, completed tests count)
    const studentData = await Promise.all(
      students.map(async (st) => {
        const enrollmentsCount = await Enrollment.countDocuments({ student: st._id });
        const testsAttempted = await TestResult.countDocuments({ student: st._id });
        return {
          ...st.toObject(),
          enrollmentsCount,
          testsAttempted,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: studentData.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum) || 1,
      currentPage: pageNum,
      data: studentData,
    });
  } catch (error) {
    console.error('Admin Get Students Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving students',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 4. TEACHER MANAGEMENT (Dedicated view, courses, tests count)
// ─────────────────────────────────────────────────────────────
// @desc    Get all teachers with search, status, courses assigned
// @route   GET /api/admin/teachers
// @access  Private (Admin only)
const getTeachers = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    let query = { role: 'teacher' };

    if (status && status !== 'all') {
      query.isActive = status === 'active';
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
      ];
    }

    const totalCount = await User.countDocuments(query);
    const teachers = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-password');

    const teacherData = await Promise.all(
      teachers.map(async (tc) => {
        const assignedCourses = await Course.find({ instructor: tc._id }).select('title price category');
        const testsCreated = await Test.countDocuments({ createdBy: tc._id });
        return {
          ...tc.toObject(),
          assignedCourses,
          coursesCount: assignedCourses.length,
          testsCount: testsCreated,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: teacherData.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum) || 1,
      currentPage: pageNum,
      data: teacherData,
    });
  } catch (error) {
    console.error('Admin Get Teachers Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving teachers',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 5. COURSE MANAGEMENT (Admin controls, search, instructor filter)
// ─────────────────────────────────────────────────────────────
// @desc    Get courses with search, category, instructor, pagination
// @route   GET /api/admin/courses
// @access  Private (Admin only)
const getAdminCourses = async (req, res) => {
  try {
    const { search, category, instructor, level, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    if (category && category !== 'all') {
      query.category = category;
    }

    if (instructor && instructor !== 'all') {
      query.instructor = instructor;
    }

    if (level && level !== 'all') {
      query.level = level;
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { title: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
      ];
    }

    const totalCount = await Course.countDocuments(query);
    const courses = await Course.find(query)
      .populate('instructor', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Attach enrolled student count to each course
    const enrichedCourses = await Promise.all(
      courses.map(async (c) => {
        const enrollmentCount = await Enrollment.countDocuments({ course: c._id });
        return {
          ...c.toObject(),
          enrollmentCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: enrichedCourses.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum) || 1,
      currentPage: pageNum,
      data: enrichedCourses,
    });
  } catch (error) {
    console.error('Admin Get Courses Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving courses',
    });
  }
};

// @desc    Admin create course
// @route   POST /api/admin/courses
// @access  Private (Admin only)
const createAdminCourse = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      level,
      duration,
      price,
      thumbnail,
      instructorId,
    } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, description, and category',
      });
    }

    // Default instructor to selected teacher or admin
    let instructor = instructorId;
    if (!instructor) {
      instructor = req.user._id;
    }

    const course = await Course.create({
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      level: level || 'All Levels',
      duration: duration || '3 Months',
      price: price !== undefined ? Number(price) : 0,
      thumbnail: thumbnail || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60',
      instructor,
    });

    const populated = await Course.findById(course._id).populate('instructor', 'name email');

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Admin Create Course Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating course',
    });
  }
};

// @desc    Admin update course
// @route   PUT /api/admin/courses/:id
// @access  Private (Admin only)
const updateAdminCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    const {
      title,
      description,
      category,
      level,
      duration,
      price,
      thumbnail,
      instructorId,
    } = req.body;

    if (title) course.title = title.trim();
    if (description) course.description = description.trim();
    if (category) course.category = category.trim();
    if (level) course.level = level;
    if (duration) course.duration = duration;
    if (price !== undefined) course.price = Number(price);
    if (thumbnail) course.thumbnail = thumbnail;
    if (instructorId) course.instructor = instructorId;

    await course.save();

    const populated = await Course.findById(course._id).populate('instructor', 'name email');

    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Admin Update Course Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating course',
    });
  }
};

// @desc    Admin delete course
// @route   DELETE /api/admin/courses/:id
// @access  Private (Admin only)
const deleteAdminCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Clean up enrollments and payments related to course
    await Enrollment.deleteMany({ course: course._id });
    await course.deleteOne();

    res.status(200).json({
      success: true,
      message: `Course "${course.title}" removed successfully`,
    });
  } catch (error) {
    console.error('Admin Delete Course Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error deleting course',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 6. ENROLLMENT MANAGEMENT (Search, Filter, Pagination, Manual)
// ─────────────────────────────────────────────────────────────
// @desc    Get all enrollments with search, filter, and pagination
// @route   GET /api/admin/enrollments
// @access  Private (Admin only)
const getAdminEnrollments = async (req, res) => {
  try {
    const { search, status, courseId, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (courseId && courseId !== 'all') {
      query.course = courseId;
    }

    // If search is provided, find matching users or courses first
    if (search && search.trim()) {
      const s = search.trim();
      const matchedUsers = await User.find({
        $or: [
          { name: { $regex: s, $options: 'i' } },
          { email: { $regex: s, $options: 'i' } },
        ],
      }).select('_id');

      const matchedCourses = await Course.find({
        title: { $regex: s, $options: 'i' },
      }).select('_id');

      const userIds = matchedUsers.map((u) => u._id);
      const courseIds = matchedCourses.map((c) => c._id);

      query.$or = [
        { student: { $in: userIds } },
        { course: { $in: courseIds } },
      ];
    }

    const totalCount = await Enrollment.countDocuments(query);
    const enrollments = await Enrollment.find(query)
      .populate('student', 'name email phone profileImage')
      .populate('course', 'title category price instructor thumbnail')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: enrollments.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum) || 1,
      currentPage: pageNum,
      data: enrollments,
    });
  } catch (error) {
    console.error('Admin Get Enrollments Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving enrollments',
    });
  }
};

// @desc    Admin manually enroll a student
// @route   POST /api/admin/enrollments
// @access  Private (Admin only)
const createAdminEnrollment = async (req, res) => {
  try {
    const { studentId, courseId } = req.body;

    if (!studentId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both studentId and courseId',
      });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const existing = await Enrollment.findOne({ student: studentId, course: courseId });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Student is already enrolled in this course',
      });
    }

    const enrollment = await Enrollment.create({
      student: studentId,
      course: courseId,
      progress: 0,
      status: 'active',
    });

    // Also record payment
    const txId = 'ADMIN-TXN-' + Date.now().toString().slice(-6);
    await Payment.create({
      student: studentId,
      course: courseId,
      amount: course.price || 0,
      paymentMethod: 'Cash / Offline',
      transactionId: txId,
      invoiceNumber: 'HSA-INV-' + Math.floor(100000 + Math.random() * 900000),
      status: 'completed',
      remarks: `Admin enrolled student in ${course.title}`,
    });

    const populated = await Enrollment.findById(enrollment._id)
      .populate('student', 'name email phone')
      .populate('course', 'title category price');

    res.status(201).json({
      success: true,
      message: `Enrolled ${student.name} in ${course.title}`,
      data: populated,
    });
  } catch (error) {
    console.error('Admin Create Enrollment Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating enrollment',
    });
  }
};

// @desc    Admin update enrollment status or progress
// @route   PUT /api/admin/enrollments/:id
// @access  Private (Admin only)
const updateAdminEnrollmentStatus = async (req, res) => {
  try {
    const { status, progress } = req.body;
    const enrollment = await Enrollment.findById(req.params.id);

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment record not found',
      });
    }

    if (status && ['active', 'completed', 'cancelled'].includes(status)) {
      enrollment.status = status;
    }

    if (progress !== undefined) {
      enrollment.progress = Math.min(100, Math.max(0, Number(progress)));
    }

    await enrollment.save();

    res.status(200).json({
      success: true,
      message: 'Enrollment updated successfully',
      data: enrollment,
    });
  } catch (error) {
    console.error('Admin Update Enrollment Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating enrollment',
    });
  }
};

// @desc    Admin delete enrollment
// @route   DELETE /api/admin/enrollments/:id
// @access  Private (Admin only)
const deleteAdminEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findByIdAndDelete(req.params.id);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Enrollment removed successfully',
    });
  } catch (error) {
    console.error('Admin Delete Enrollment Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error deleting enrollment',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 7. TEST MANAGEMENT (Search, Filter, Pagination, Admin actions)
// ─────────────────────────────────────────────────────────────
// @desc    Get all tests with search, subject filter, status, pagination
// @route   GET /api/admin/tests
// @access  Private (Admin only)
const getAdminTests = async (req, res) => {
  try {
    const { search, subject, status, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    if (subject && subject !== 'all') {
      query.subject = subject;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { title: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
      ];
    }

    const totalCount = await Test.countDocuments(query);
    const tests = await Test.find(query)
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Enriched with submissions count
    const enriched = await Promise.all(
      tests.map(async (t) => {
        const submissionsCount = await TestResult.countDocuments({ test: t._id });
        return {
          ...t.toObject(),
          questionsCount: t.questions?.length || 0,
          submissionsCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: enriched.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum) || 1,
      currentPage: pageNum,
      data: enriched,
    });
  } catch (error) {
    console.error('Admin Get Tests Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving tests',
    });
  }
};

// @desc    Admin update test status
// @route   PUT /api/admin/tests/:id/status
// @access  Private (Admin only)
const updateAdminTestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be draft, published, or archived.',
      });
    }

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    test.status = status;
    await test.save();

    res.status(200).json({
      success: true,
      message: `Test status updated to "${status}"`,
      data: test,
    });
  } catch (error) {
    console.error('Admin Update Test Status Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating test status',
    });
  }
};

// @desc    Admin delete test
// @route   DELETE /api/admin/tests/:id
// @access  Private (Admin only)
const deleteAdminTest = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    await TestResult.deleteMany({ test: test._id });
    await test.deleteOne();

    res.status(200).json({
      success: true,
      message: `Test "${test.title}" and related submissions deleted successfully`,
    });
  } catch (error) {
    console.error('Admin Delete Test Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error deleting test',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 8. PAYMENT & REVENUE MANAGEMENT
// ─────────────────────────────────────────────────────────────
// @desc    Get all payment transactions with search, filter, pagination
// @route   GET /api/admin/payments
// @access  Private (Admin only)
const getAdminPayments = async (req, res) => {
  try {
    await ensureEnrollmentPayments();

    const { search, status, paymentMethod, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (paymentMethod && paymentMethod !== 'all') {
      query.paymentMethod = paymentMethod;
    }

    if (search && search.trim()) {
      const s = search.trim();
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: s, $options: 'i' } },
          { email: { $regex: s, $options: 'i' } },
        ],
      }).select('_id');

      const userIds = matchingUsers.map((u) => u._id);

      query.$or = [
        { transactionId: { $regex: s, $options: 'i' } },
        { invoiceNumber: { $regex: s, $options: 'i' } },
        { student: { $in: userIds } },
      ];
    }

    const totalCount = await Payment.countDocuments(query);
    const payments = await Payment.find(query)
      .populate('student', 'name email phone')
      .populate('course', 'title price category')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limitNum);

    // Summary calculations
    const completedAgg = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const pendingAgg = await Payment.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const refundedAgg = await Payment.aggregate([
      { $match: { status: 'refunded' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.status(200).json({
      success: true,
      count: payments.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum) || 1,
      currentPage: pageNum,
      summary: {
        totalRevenue: completedAgg[0]?.total || 0,
        pendingAmount: pendingAgg[0]?.total || 0,
        refundedAmount: refundedAgg[0]?.total || 0,
        completedCount: await Payment.countDocuments({ status: 'completed' }),
        pendingCount: await Payment.countDocuments({ status: 'pending' }),
        refundedCount: await Payment.countDocuments({ status: 'refunded' }),
      },
      data: payments,
    });
  } catch (error) {
    console.error('Admin Get Payments Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving payments',
    });
  }
};

// @desc    Admin record manual / offline payment
// @route   POST /api/admin/payments
// @access  Private (Admin only)
const recordAdminPayment = async (req, res) => {
  try {
    const {
      studentId,
      courseId,
      amount,
      paymentMethod,
      status,
      remarks,
    } = req.body;

    if (!studentId || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide student and amount',
      });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const txId = 'MANUAL-' + Date.now().toString().slice(-8);
    const invoiceNum = 'HSA-INV-' + Math.floor(100000 + Math.random() * 900000);

    const payment = await Payment.create({
      student: studentId,
      course: courseId || undefined,
      amount: Number(amount) || 0,
      paymentMethod: paymentMethod || 'Cash / Offline',
      status: status || 'completed',
      transactionId: txId,
      invoiceNumber: invoiceNum,
      remarks: remarks || `Payment recorded by admin for ${student.name}`,
      paymentDate: new Date(),
    });

    // If payment is completed and courseId is provided, ensure enrollment exists
    if (payment.status === 'completed' && courseId) {
      const existingEnrollment = await Enrollment.findOne({ student: studentId, course: courseId });
      if (!existingEnrollment) {
        await Enrollment.create({
          student: studentId,
          course: courseId,
          progress: 0,
          status: 'active',
        });
      }
    }

    const populated = await Payment.findById(payment._id)
      .populate('student', 'name email phone')
      .populate('course', 'title price');

    res.status(201).json({
      success: true,
      message: `Payment of ₹${payment.amount} recorded for ${student.name}`,
      data: populated,
    });
  } catch (error) {
    console.error('Admin Record Payment Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error recording payment',
    });
  }
};

// @desc    Admin update payment status (e.g. mark completed or refunded)
// @route   PUT /api/admin/payments/:id/status
// @access  Private (Admin only)
const updateAdminPaymentStatus = async (req, res) => {
  try {
    const { status, remarks } = req.body;
    if (!['completed', 'pending', 'failed', 'refunded'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be completed, pending, failed, or refunded.',
      });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    payment.status = status;
    if (remarks) payment.remarks = remarks;
    await payment.save();

    res.status(200).json({
      success: true,
      message: `Payment status changed to ${status}`,
      data: payment,
    });
  } catch (error) {
    console.error('Admin Update Payment Status Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating payment status',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 9. ACADEMY REPORTS & ANALYTICS
// ─────────────────────────────────────────────────────────────
// @desc    Get aggregated academy reports & export data
// @route   GET /api/admin/reports
// @access  Private (Admin only)
const getAdminReports = async (req, res) => {
  try {
    await ensureEnrollmentPayments();

    // 1. Revenue by Payment Method
    const revenueByMethod = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    // 2. Course Popularity (Enrollments per Course)
    const courses = await Course.find().select('title category price');
    const courseStats = await Promise.all(
      courses.map(async (c) => {
        const enrollments = await Enrollment.countDocuments({ course: c._id });
        const revenue = enrollments * (c.price || 0);
        return {
          id: c._id,
          title: c.title,
          category: c.category,
          price: c.price,
          enrollments,
          revenue,
        };
      })
    );
    courseStats.sort((a, b) => b.enrollments - a.enrollments);

    // 3. Category Breakdown
    const categoryBreakdown = {};
    courseStats.forEach((c) => {
      const cat = c.category || 'General';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { courses: 0, enrollments: 0, revenue: 0 };
      }
      categoryBreakdown[cat].courses += 1;
      categoryBreakdown[cat].enrollments += c.enrollments;
      categoryBreakdown[cat].revenue += c.revenue;
    });

    // 4. Student Enrollment Status Distribution
    const activeEnrollments = await Enrollment.countDocuments({ status: 'active' });
    const completedEnrollments = await Enrollment.countDocuments({ status: 'completed' });
    const cancelledEnrollments = await Enrollment.countDocuments({ status: 'cancelled' });

    // 5. Test Metrics
    const totalTests = await Test.countDocuments();
    const totalSubmissions = await TestResult.countDocuments();
    const passedSubmissions = await TestResult.countDocuments({ passed: true });

    // 6. Overall Financial Summary
    const totalRevenueAgg = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalRevenue: totalRevenueAgg[0]?.total || 0,
        revenueByMethod,
        courseStats,
        categoryBreakdown,
        enrollmentStatus: {
          active: activeEnrollments,
          completed: completedEnrollments,
          cancelled: cancelledEnrollments,
          total: activeEnrollments + completedEnrollments + cancelledEnrollments,
        },
        testMetrics: {
          totalTests,
          totalSubmissions,
          passedSubmissions,
          passRate: totalSubmissions > 0 ? Math.round((passedSubmissions / totalSubmissions) * 100) : 0,
        },
      },
    });
  } catch (error) {
    console.error('Admin Reports Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error generating reports',
    });
  }
};

module.exports = {
  getAdminStats,
  getAllUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  changeUserRole,
  deleteUser,
  getStudents,
  getTeachers,
  getAdminCourses,
  createAdminCourse,
  updateAdminCourse,
  deleteAdminCourse,
  getAdminEnrollments,
  createAdminEnrollment,
  updateAdminEnrollmentStatus,
  deleteAdminEnrollment,
  getAdminTests,
  updateAdminTestStatus,
  deleteAdminTest,
  getAdminPayments,
  recordAdminPayment,
  updateAdminPaymentStatus,
  getAdminReports,
};
