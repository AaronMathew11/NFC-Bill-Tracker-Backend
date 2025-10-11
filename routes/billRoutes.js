const express = require('express');
const multer = require('multer');
const { storage } = require('./cloudinaryConfig'); // Remove '.js' extension if not using type: module
const Bill = require('../models/bill');
const EventLog = require('../models/eventLog');
const { cloudinary } = require('./cloudinaryConfig');

const router = express.Router();
const upload = multer({ storage });

// router.get('/test-cloudinary', async (req, res) => {
//     console.log("Test Cloudinary route hit");
//     try {
//       res.json("result");
//     } catch (err) {
//       console.error(err);
//       res.status(500).send(err.message);
//     }
//   });
  
router.get('/all-bills-with-stats', async (req, res) => {
    try {
      const bills = await Bill.find(); // Fetch all bills
  
      const totalBills = bills.length;
      const approvedBills = bills.filter(bill => bill.status === 'approved').length;
      const declinedBills = bills.filter(bill => bill.status === 'declined').length;
  
      res.json({
        success: true,
        bills,
        statistics: {
          totalBills,
          approvedBills,
          declinedBills,
        }
      });
    } catch (error) {
      console.error('Error fetching bills:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });
  

// POST - Upload a new bill
router.post('/upload-bill', upload.single('photo'), async (req, res) => {
  try {
    const { entryDate, billDate, personName, amount, type, description, category, userId, isDraft } = req.body;
    const photoUrl = req.file ? req.file.path : null;

    const bill = new Bill({
      entryDate,
      billDate,
      personName,
      amount,
      type,
      description,
      category,
      photoUrl,
      userId,
      isDraft: isDraft === 'true',
      status: 'pending',
    });

    await bill.save();

    // Log the event
    await logEvent(
      personName || 'User',
      'create',
      bill._id.toString(),
      null,
      null,
      `${isDraft === 'true' ? 'Draft' : 'Bill'} created: ${description}`,
      req.ip
    );

    res.json({ success: true, bill });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// GET - Fetch user's own bills
router.get('/user-bills/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const bills = await Bill.find({ userId }).sort({ createdAt: -1 });

    res.json({ success: true, bills });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// GET - Fetch all bills (admin dashboard)
router.get('/all-bills', async (req, res) => {
  try {
    const bills = await Bill.find({}).sort({ createdAt: -1 });

    res.json({ success: true, bills });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// PATCH - Update bill content
router.patch('/update-bill/:billId', upload.single('photo'), async (req, res) => {
  try {
    const { billId } = req.params;
    const { entryDate, billDate, personName, amount, type, description, category, isDraft } = req.body;
    
    const oldBill = await Bill.findById(billId);
    if (!oldBill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    const updateData = {
      entryDate,
      billDate,
      personName,
      amount,
      type,
      description,
      category,
      isDraft: isDraft === 'true' || isDraft === true,
    };

    // Update photo if provided
    if (req.file) {
      updateData.photoUrl = req.file.path;
    }

    const updatedBill = await Bill.findByIdAndUpdate(
      billId,
      updateData,
      { new: true }
    );

    // Log the event
    await logEvent(
      personName || 'User',
      'update',
      billId,
      null,
      null,
      `Bill updated: ${description}`,
      req.ip
    );

    res.json({ success: true, bill: updatedBill });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// PATCH - Approve, Reject, or Return a bill
router.patch('/update-bill-status/:billId', async (req, res) => {
  try {
    const { billId } = req.params;
    const { status, remarks, adminId, adminName } = req.body;

    if (!['approved', 'rejected', 'returned'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value' });
    }

    const oldBill = await Bill.findById(billId);
    if (!oldBill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    const updateData = { status };
    if (status === 'approved') {
      updateData.dateOfSettlement = new Date();
    }
    if (remarks) updateData.remarks = remarks;
    if (adminId) updateData.adminId = adminId;

    const updatedBill = await Bill.findByIdAndUpdate(
      billId,
      updateData,
      { new: true }
    );

    // Log the event
    await logEvent(
      adminName || 'Admin',
      status === 'approved' ? 'approve' : status === 'rejected' ? 'decline' : 'return',
      billId,
      oldBill.status,
      status,
      remarks || `Bill ${status}`,
      req.ip
    );

    res.json({ success: true, bill: updatedBill });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// DELETE - (optional) Delete a bill
router.delete('/delete-bill/:billId', async (req, res) => {
  try {
    const { billId } = req.params;

    const deletedBill = await Bill.findByIdAndDelete(billId);

    if (!deletedBill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    res.json({ success: true, message: 'Bill deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// POST - Check for duplicate bills
router.post('/check-duplicate', async (req, res) => {
  try {
    const { billDate, amount, description, personName } = req.body;

    const existingBill = await Bill.findOne({
      billDate: new Date(billDate),
      amount: parseFloat(amount),
      description: { $regex: description, $options: 'i' },
      personName: { $regex: personName, $options: 'i' }
    });

    res.json({ success: true, isDuplicate: !!existingBill });
  } catch (error) {
    console.error('Error checking duplicates:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// POST - Direct payment logging
router.post('/direct-payment', upload.single('photo'), async (req, res) => {
  try {
    const { entryDate, billDate, vendorName, amount, description, category, type, paymentType, status, dateOfSettlement, adminId } = req.body;
    console.log('Received direct payment data:', { entryDate, billDate, vendorName, amount, description, category, type, paymentType, status, dateOfSettlement, adminId });
    const photoUrl = req.file ? req.file.path : null;

    console.log('About to create bill with personName:', vendorName);
    const bill = new Bill({
      entryDate,
      billDate,
      personName: vendorName, // Map vendorName to personName for schema compatibility
      vendorName,
      amount,
      type: type || 'debit',
      description,
      category,
      photoUrl,
      userId: adminId,
      adminId,
      status: status || 'approved',
      paymentType: paymentType || 'direct',
      dateOfSettlement: dateOfSettlement ? new Date(dateOfSettlement) : new Date(),
      isDraft: false,
    });

    await bill.save();

    res.json({ success: true, bill });
  } catch (error) {
    console.error('Error logging direct payment:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// GET - Ledger data
router.get('/ledger', async (req, res) => {
  try {
    const bills = await Bill.find({ status: { $ne: 'pending' } }).sort({ entryDate: 1 });
    
    let balance = 0;
    const ledger = bills.map(bill => {
      if (bill.type === 'credit') {
        balance += bill.amount;
      } else {
        balance -= bill.amount;
      }
      
      return {
        entryDate: bill.entryDate,
        billDate: bill.billDate,
        dateOfSettlement: bill.dateOfSettlement,
        description: bill.description,
        amount: bill.amount,
        type: bill.type,
        balance: balance,
        category: bill.category,
        remarks: bill.remarks,
        billSoftcopyUrl: bill.photoUrl
      };
    });

    res.json({ success: true, ledger });
  } catch (error) {
    console.error('Error fetching ledger:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// GET - Event logs
router.get('/event-logs', async (req, res) => {
  try {
    const logs = await EventLog.find({}).sort({ timestamp: -1 });
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Error fetching event logs:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// GET - Users data (extracted from bills)
router.get('/users', async (req, res) => {
  try {
    const bills = await Bill.find({});
    
    // Extract unique users from bills
    const uniqueUsers = {};
    bills.forEach(bill => {
      const userKey = bill.personName || bill.vendorName || 'Unknown';
      if (!uniqueUsers[userKey]) {
        uniqueUsers[userKey] = {
          _id: userKey,
          name: userKey,
          email: bill.email || 'N/A',
          totalBills: 0,
          totalAmount: 0,
          pendingBills: 0,
          approvedBills: 0,
          rejectedBills: 0,
          returnedBills: 0
        };
      }
      uniqueUsers[userKey].totalBills += 1;
      uniqueUsers[userKey].totalAmount += Number(bill.amount);
      if (bill.status === 'pending') uniqueUsers[userKey].pendingBills += 1;
      if (bill.status === 'approved') uniqueUsers[userKey].approvedBills += 1;
      if (bill.status === 'rejected') uniqueUsers[userKey].rejectedBills += 1;
      if (bill.status === 'returned') uniqueUsers[userKey].returnedBills += 1;
    });
    
    const users = Object.values(uniqueUsers);
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// Helper function to log events
const logEvent = async (actor, action, entityId = null, oldValue = null, newValue = null, details = null, ipDevice = null) => {
  try {
    const eventLog = new EventLog({
      actor,
      action,
      entityId,
      oldValue,
      newValue,
      details,
      ipDevice
    });
    await eventLog.save();
  } catch (error) {
    console.error('Error logging event:', error);
  }
};

module.exports = router;
