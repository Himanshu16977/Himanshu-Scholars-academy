const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student reference is required'],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'INR',
    },
    orderId: {
      type: String,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ['UPI', 'Card', 'Net Banking', 'Cash / Offline', 'Razorpay', 'Paytm', 'Bank Transfer', 'Wallet'],
      default: 'UPI',
    },
    status: {
      type: String,
      enum: ['completed', 'pending', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
    },
    transactionId: {
      type: String,
      required: [true, 'Transaction ID is required'],
      unique: true,
      trim: true,
    },
    gatewayPaymentId: {
      type: String,
      trim: true,
    },
    signature: {
      type: String,
      trim: true,
    },
    failureReason: {
      type: String,
      default: '',
      trim: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      default: '',
      trim: true,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ student: 1, paymentDate: -1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ orderId: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
