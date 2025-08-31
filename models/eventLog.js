const mongoose = require('mongoose');

const EventLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  actor: { type: String, required: true },
  action: { type: String, required: true, enum: ['create', 'edit', 'approve', 'decline', 'return', 'export'] },
  entityId: { type: String },
  oldValue: { type: String },
  newValue: { type: String },
  details: { type: String },
  ipDevice: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('EventLog', EventLogSchema);