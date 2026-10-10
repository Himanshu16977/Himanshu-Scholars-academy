const crypto = require('crypto');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');

// Helper to get payment gateway secret securely from environment
const getGatewaySecret = () => {
  return process.env.PAYMENT_GATEWAY_KEY_SECRET || 'hsa_secret_sig_key_2026_himanshu_scholars_998877';
};

const getGatewayKeyId = () => {
  return process.env.PAYMENT_GATEWAY_KEY_ID || 'rzp_live_hsa_2026_pubkey';
};

// ─────────────────────────────────────────────────────────────
// 1. CREATE PAYMENT ORDER
// ─────────────────────────────────────────────────────────────
// @desc    Initiate a secure payment order for course purchase
// @route   POST /api/payments/create-order
// @access  Private (Student, Admin)
const createPaymentOrder = async (req, res) => {
  try {
    const { courseId } = req.body;
    const studentId = req.user._id;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID is required',
      });
    }

    // 1. Fetch course details from database (never trust client price)
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // 2. Prevent duplicate enrollment
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      course: courseId,
    });

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        isAlreadyEnrolled: true,
        message: 'You are already enrolled in this course',
      });
    }

    // 3. Handle free courses (Price = 0)
    if (course.price === 0) {
      const enrollment = await Enrollment.create({
        student: studentId,
        course: courseId,
        progress: 0,
        status: 'active',
      });

      const txId = 'FREE-' + Date.now().toString().slice(-6);
      await Payment.create({
        student: studentId,
        course: courseId,
        amount: 0,
        currency: 'INR',
        paymentMethod: 'Cash / Offline',
        status: 'completed',
        transactionId: txId,
        invoiceNumber: 'HSA-INV-' + Math.floor(100000 + Math.random() * 900000),
        remarks: `Free enrollment in ${course.title}`,
      });

      return res.status(200).json({
        success: true,
        isFree: true,
        message: `Successfully enrolled in ${course.title}!`,
        enrollment,
      });
    }

    // 4. Generate unique order identifiers
    const timestamp = Date.now();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = `order_${timestamp}_${randomSuffix}`;
    const transactionId = `TXN-${timestamp}-${randomSuffix}`;
    const invoiceNumber = `HSA-INV-${Math.floor(100000 + Math.random() * 900000)}`;

    // 5. Store pending payment record in DB
    const payment = await Payment.create({
      student: studentId,
      course: courseId,
      amount: course.price,
      currency: 'INR',
      orderId,
      transactionId,
      invoiceNumber,
      status: 'pending',
      paymentMethod: 'UPI',
      remarks: `Order created for ${course.title}`,
    });

    // 6. Return order payload (ONLY PUBLIC KEY ID, SECRET IS NEVER EXPOSED)
    res.status(201).json({
      success: true,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      invoiceNumber: payment.invoiceNumber,
      keyId: getGatewayKeyId(),
      course: {
        id: course._id,
        title: course.title,
        price: course.price,
        thumbnail: course.thumbnail,
        category: course.category,
      },
      student: {
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
      },
    });
  } catch (error) {
    console.error('Create Payment Order Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating payment order',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 2. BACKEND GATEWAY SIGNING (Simulated Gateway Authorizer)
// ─────────────────────────────────────────────────────────────
// @desc    Cryptographically sign payment payload using backend secret key
// @route   POST /api/payments/gateway-sign
// @access  Private (Student, Admin)
const gatewaySignPayment = async (req, res) => {
  try {
    const { orderId, paymentId, simulateFailure } = req.body;

    if (!orderId || !paymentId) {
      return res.status(400).json({
        success: false,
        message: 'orderId and paymentId are required',
      });
    }

    // If simulating payment gateway decline / failure
    if (simulateFailure) {
      return res.status(200).json({
        success: true,
        signature: 'INVALID_SIGNATURE_PAYMENT_DECLINED',
        status: 'declined',
      });
    }

    // Sign payload strictly with secret from environment variables
    const secret = getGatewaySecret();
    const payload = `${orderId}|${paymentId}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    res.status(200).json({
      success: true,
      signature,
      paymentId,
      status: 'authorized',
    });
  } catch (error) {
    console.error('Gateway Signing Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate payment signature',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 3. SECURE PAYMENT VERIFICATION & ENROLLMENT
// ─────────────────────────────────────────────────────────────
// @desc    Verify payment signature on backend and enroll student
// @route   POST /api/payments/verify
// @access  Private (Student, Admin)
const verifyPaymentAndEnroll = async (req, res) => {
  try {
    const {
      orderId,
      paymentId,
      signature,
      paymentMethod = 'UPI',
    } = req.body;

    const studentId = req.user._id;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Order ID, payment ID, and signature are required for verification',
      });
    }

    // 1. Find pending payment record in database
    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment order record not found in system',
      });
    }

    // Ensure payment belongs to the authenticated student
    if (payment.student.toString() !== studentId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized payment verification attempt',
      });
    }

    // 2. Prevent duplicate enrollment check
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      course: payment.course,
    });

    if (existingEnrollment) {
      // Mark payment status if needed
      payment.status = 'completed';
      payment.remarks = 'Already enrolled in course';
      await payment.save();

      return res.status(400).json({
        success: false,
        isAlreadyEnrolled: true,
        message: 'You are already enrolled in this course',
      });
    }

    // 3. VERIFY CRYPTOGRAPHIC SIGNATURE ON BACKEND
    // Do NOT trust frontend payment success! Compute HMAC using backend secret
    const secret = getGatewaySecret();
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const sigBuffer = Buffer.from(String(signature), 'utf8');
    const expBuffer = Buffer.from(String(expectedSignature), 'utf8');

    const isAuthentic =
      sigBuffer.length === expBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expBuffer);

    // 4. Handle Failed / Tampered Payment
    if (!isAuthentic) {
      payment.status = 'failed';
      payment.failureReason = 'Cryptographic signature mismatch or transaction declined';
      payment.gatewayPaymentId = paymentId;
      await payment.save();

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed: Invalid transaction signature or bank decline.',
        status: 'failed',
      });
    }

    // 5. Signature Verified! Update payment record to completed
    payment.status = 'completed';
    payment.gatewayPaymentId = paymentId;
    payment.transactionId = paymentId || payment.transactionId;
    payment.signature = signature;
    payment.paymentMethod = paymentMethod;
    payment.paymentDate = new Date();
    payment.remarks = `Successfully verified online payment of ₹${payment.amount}`;
    await payment.save();

    // 6. Create verified enrollment record
    const enrollment = await Enrollment.create({
      student: studentId,
      course: payment.course,
      progress: 0,
      status: 'active',
      enrolledAt: new Date(),
    });

    // Populate for response
    const populatedEnrollment = await Enrollment.findById(enrollment._id)
      .populate('course')
      .populate('student', 'name email');

    res.status(200).json({
      success: true,
      message: 'Payment verified and course enrolled successfully!',
      payment: {
        id: payment._id,
        orderId: payment.orderId,
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: payment.currency,
        invoiceNumber: payment.invoiceNumber,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
      },
      enrollment: populatedEnrollment,
    });
  } catch (error) {
    console.error('Verify Payment Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error verifying payment',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 4. HANDLE CANCELLED PAYMENT
// ─────────────────────────────────────────────────────────────
// @desc    Record customer cancellation of checkout window
// @route   POST /api/payments/cancel
// @access  Private (Student, Admin)
const cancelPaymentOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required to cancel transaction',
      });
    }

    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (payment.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized payment cancellation',
      });
    }

    if (payment.status === 'pending') {
      payment.status = 'cancelled';
      payment.failureReason = reason || 'Payment cancelled by user at checkout screen';
      await payment.save();
    }

    res.status(200).json({
      success: true,
      message: 'Payment order cancelled safely. No funds were debited.',
      status: 'cancelled',
    });
  } catch (error) {
    console.error('Cancel Payment Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error cancelling payment',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// 5. GET USER'S PAYMENT HISTORY
// ─────────────────────────────────────────────────────────────
// @desc    Get logged in user's transactions and receipts
// @route   GET /api/payments/my
// @access  Private (Student, Admin)
const getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ student: req.user._id })
      .populate('course', 'title category price thumbnail')
      .sort({ paymentDate: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: payments.length,
      data: payments,
    });
  } catch (error) {
    console.error('Get My Payments Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving payments',
    });
  }
};

module.exports = {
  createPaymentOrder,
  gatewaySignPayment,
  verifyPaymentAndEnroll,
  cancelPaymentOrder,
  getMyPayments,
};
