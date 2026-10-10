const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes: verify JWT Bearer token and attach authenticated user to req
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Extract token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token signature
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'hsa_jwt_super_secret_key_2026_himanshu_scholars_academy'
      );

      // Find user by id (password is excluded by default in schema)
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User belonging to this token no longer exists',
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Authentication Error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed or expired',
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no authentication token provided',
    });
  }
};

// Grant access to specific roles (RBAC)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: User role '${req.user ? req.user.role : 'unauthenticated'}' is not authorized to access this resource`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
