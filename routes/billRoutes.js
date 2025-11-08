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
  

// Helper function to handle multer errors
const handleMulterError = (err, req, res, next) => {
  if (err) {
    console.error('Multer/Busboy error:', err);
    if (err.message && err.message.includes('Unexpected end of form')) {
      // This is a Firebase Functions busboy issue, continue without file
      req.file = null;
      return next();
    }
    return res.status(400).json({ success: false, error: 'File upload error' });
  }
  next();
};

// POST - Upload a new bill (JSON with base64 image)
router.post('/upload-bill-json', async (req, res) => {
  try {
    const { entryDate, billDate, personName, amount, type, description, category, userId, isDraft, photoBase64 } = req.body;
    
    let photoUrl = null;
    
    // If photoBase64 is provided, upload to Cloudinary
    if (photoBase64) {
      try {
        const uploadResult = await cloudinary.uploader.upload(photoBase64, {
          folder: 'bills',
          resource_type: 'auto'
        });
        photoUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        // Continue without photo rather than failing
      }
    }

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
      isDraft: isDraft === 'true' || isDraft === true,
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
      `${isDraft ? 'Draft' : 'Bill'} created: ${description}`,
      req.ip
    );

    res.json({ success: true, bill });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// POST - Upload a new bill (legacy multipart form)
router.post('/upload-bill', (req, res, next) => {
  upload.single('photo')(req, res, (err) => handleMulterError(err, req, res, next));
}, async (req, res) => {
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
    // Exclude 'returned' status bills as they are fetched via separate endpoint
    const bills = await Bill.find({ 
      userId,
      status: { $ne: 'returned' }
    }).sort({ createdAt: -1 });

    res.json({ success: true, bills });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// GET - Fetch user's returned/rejected bills (bills that need user attention)
router.get('/user-returned-bills/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    // Only fetch bills with status 'returned' - these are bills that need user action
    // 'rejected' bills are final and should not be editable
    const bills = await Bill.find({ 
      userId, 
      status: 'returned'
    }).sort({ updatedAt: -1 });

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

// GET - Pending direct payments for approval (excludes bills created by the requesting admin)
router.get('/pending-direct-payments/:adminId', async (req, res) => {
  try {
    const { adminId } = req.params;
    
    // Fetch pending direct payments not created by this admin
    const bills = await Bill.find({ 
      status: 'pending',
      paymentType: 'direct',
      createdByAdminId: { $ne: adminId } // Exclude bills created by this admin
    }).sort({ createdAt: -1 });

    res.json({ success: true, bills });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// GET - User-submitted bills for admin review (excludes direct payments from admins)
router.get('/user-submitted-bills', async (req, res) => {
  try {
    // Only fetch bills submitted by users (reimbursement type), not direct payments from admins
    const bills = await Bill.find({ 
      paymentType: { $ne: 'direct' } // Exclude direct payments
    }).sort({ createdAt: -1 });

    res.json({ success: true, bills });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// PATCH - Update bill content (JSON with base64 image)
router.patch('/update-bill-json/:billId', async (req, res) => {
  try {
    const { billId } = req.params;
    const { entryDate, billDate, personName, amount, type, description, category, isDraft, photoBase64 } = req.body;
    
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

    // If bill was returned/rejected and is being updated, reset status to pending for re-review
    if (oldBill.status === 'returned' || oldBill.status === 'rejected') {
      updateData.status = 'pending';
      updateData.remarks = null; // Clear previous admin remarks
    }

    // Update photo if provided
    if (photoBase64) {
      try {
        const uploadResult = await cloudinary.uploader.upload(photoBase64, {
          folder: 'bills',
          resource_type: 'auto'
        });
        updateData.photoUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        // Continue without updating photo rather than failing
      }
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
      oldBill.status,
      updateData.status || oldBill.status,
      `Bill updated: ${description}`,
      req.ip
    );

    res.json({ success: true, bill: updatedBill });
  } catch (error) {
    console.error('Error updating bill:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server Error', 
      message: error.message
    });
  }
});

// PATCH - Update bill content (legacy multipart form)
router.patch('/update-bill/:billId', (req, res, next) => {
  upload.single('photo')(req, res, (err) => handleMulterError(err, req, res, next));
}, async (req, res) => {
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

    // For direct payments, prevent self-approval
    if (oldBill.paymentType === 'direct' && oldBill.createdByAdminId === adminId && status === 'approved') {
      return res.status(400).json({ 
        success: false, 
        error: 'Direct payments cannot be approved by the same admin who created them' 
      });
    }

    const updateData = { status };
    if (status === 'approved') {
      updateData.dateOfSettlement = new Date();
      // Track which admin approved it and their name
      updateData.approvedByAdminId = adminId;
      updateData.approvedByAdminName = adminName || 'Admin';
    }
    if (remarks) updateData.remarks = remarks;
    if (adminId) updateData.adminId = adminId;

    const updatedBill = await Bill.findByIdAndUpdate(
      billId,
      updateData,
      { new: true }
    );

    // Log the event - Enhanced for direct payments to show both creating and approving admin
    const isDirectPayment = oldBill.paymentType === 'direct';
    const logMessage = isDirectPayment 
      ? `Direct payment ${status} by ${adminName || 'Admin'} (originally created by ${oldBill.createdByAdminName || 'Unknown Admin'}): ${oldBill.description}${remarks ? ` - ${remarks}` : ''}`
      : `${remarks || `Bill ${status}`}`;
    
    await logEvent(
      `${adminName || 'Admin'} (${status === 'approved' ? 'Approving' : status === 'rejected' ? 'Rejecting' : 'Returning'} Admin)`,
      status === 'approved' ? 'approve' : status === 'rejected' ? 'decline' : 'return',
      billId,
      oldBill.status,
      status,
      logMessage,
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

// POST - Direct payment logging (JSON with base64 image)
router.post('/direct-payment-json', async (req, res) => {
  try {
    const { entryDate, billDate, vendorName, amount, description, category, type, paymentType, status, dateOfSettlement, adminId, adminName, photoBase64 } = req.body;
    console.log('Received direct payment data:', { entryDate, billDate, vendorName, amount, description, category, type, paymentType, status, dateOfSettlement, adminId });
    
    let photoUrl = null;
    
    // If photoBase64 is provided, upload to Cloudinary
    if (photoBase64) {
      try {
        const uploadResult = await cloudinary.uploader.upload(photoBase64, {
          folder: 'bills',
          resource_type: 'auto'
        });
        photoUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        // Continue without photo rather than failing
      }
    }

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
      createdByAdminId: adminId, // Track which admin created this direct payment
      createdByAdminName: adminName || 'Admin', // Track admin name who created this
      status: 'pending', // Direct payments now require approval from another admin
      paymentType: paymentType || 'direct',
      // dateOfSettlement will be set when approved
      isDraft: false,
    });

    await bill.save();

    // Log the event
    await logEvent(
      `${adminName || 'Admin'} (Creating Admin)`,
      'create',
      bill._id.toString(),
      null,
      null,
      `Direct payment created by ${adminName || 'Admin'} for ${vendorName || 'Unknown Vendor'} (pending approval): ${description}`,
      req.ip
    );

    res.json({ success: true, bill });
  } catch (error) {
    console.error('Error logging direct payment:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// POST - Direct payment logging (legacy multipart form)
router.post('/direct-payment', (req, res, next) => {
  upload.single('photo')(req, res, (err) => handleMulterError(err, req, res, next));
}, async (req, res) => {
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
    const bills = await Bill.find({ status: 'approved' }).sort({ createdAt: 1 });
    
    let balance = 0;
    const ledger = bills.map(bill => {
      if (bill.type === 'credit') {
        balance += bill.amount;
      } else {
        balance -= bill.amount;
      }
      
      return {
        billId: bill._id.toString(), // Bill ID for cross-referencing with event logs
        entryDate: bill.createdAt, // Date when bill was raised/created
        billDate: bill.billDate,
        dateOfSettlement: bill.dateOfSettlement, // Date when bill was approved
        description: bill.description,
        personName: bill.personName || bill.vendorName || 'Unknown',
        raisedBy: bill.paymentType === 'direct' 
          ? (bill.createdByAdminName || 'Admin') 
          : (bill.personName || 'User'),
        approvedBy: bill.approvedByAdminName || 'Admin',
        amount: bill.amount,
        type: bill.type,
        balance: balance,
        category: bill.category,
        remarks: bill.remarks,
        billSoftcopyUrl: bill.photoUrl,
        paymentType: bill.paymentType
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

// POST - Send email notification
router.post('/send-email', async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    
    if (!to || !subject || !html) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: to, subject, html' 
      });
    }

    // TODO: Implement actual email sending logic here
    // For now, just log the email and return success
    console.log('Email would be sent to:', to);
    console.log('Subject:', subject);
    console.log('HTML content:', html.substring(0, 100) + '...');
    
    // Log the email event
    await logEvent(
      'System',
      'email',
      null,
      null,
      to,
      `Email sent: ${subject}`,
      null
    );

    res.json({ 
      success: true, 
      message: 'Email notification logged (email service not configured yet)' 
    });
  } catch (error) {
    console.error('Error sending email:', error);
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
