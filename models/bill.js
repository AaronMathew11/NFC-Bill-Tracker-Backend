const mongoose = require('mongoose');

const BillSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  personName: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  description: { type: String },
  photoUrl: { type: String },
  userId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('Bill', BillSchema);
