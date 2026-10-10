const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// @desc    Register a new user (Student / Teacher / Admin)
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists. Please log in.',
      });
    }

    // Validate role if provided
    const validRoles = ['student', 'teacher', 'admin'];
    const assignedRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'student';

    // Create user in database
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      password,
      role: assignedRole,
    });

    // Generate JWT token
    const token = generateToken(user._id, user.role);

    res.status(201).json({
      success: true,
      message: `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} registered successfully`,
      token,
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
    console.error('Registration Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during user registration',
    });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
      });
    }

    // Check for user (include password field which is select: false by default)
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Verify password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if account has been disabled
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated by administrator. Please contact support.',
      });
    }

    // Generate JWT token
    const token = generateToken(user._id, user.role);

    res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
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
    console.error('Login Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during authentication',
    });
  }
};

// @desc    Get current logged in user profile
// @route   GET /api/auth/me
// @access  Private (Protected by JWT)
const getMe = async (req, res) => {
  try {
    // req.user is already populated by protect middleware
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    console.error('Get Profile Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving user profile',
    });
  }
};

// @desc    Test role-protected endpoint (for Admin/Teacher)
// @route   GET /api/auth/admin-check
// @access  Private (Admin only)
const adminCheck = async (req, res) => {
  res.status(200).json({
    success: true,
    message: `Access granted! You are verified as an Admin: ${req.user.name}`,
    adminId: req.user._id,
  });
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  adminCheck,
};
