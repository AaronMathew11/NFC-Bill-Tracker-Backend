const mongoose = require('mongoose');

const BillSchema = new mongoose.Schema({
  entryDate: { type: Date, required: true },
  billDate: { type: Date, required: true },
  personName: { type: String, required: true },
  vendorName: { type: String },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  photoUrl: { type: String },
  userId: { type: String, required: true },
  adminId: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'returned'], default: 'pending' },
  isDraft: { type: Boolean, default: false },
  dateOfSettlement: { type: Date },
  paymentType: { type: String, enum: ['direct', 'reimbursement'], default: 'reimbursement' },
  remarks: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Bill', BillSchema);
