const express = require('express');
const multer = require('multer');
const { storage } = require('./cloudinaryConfig'); // Remove '.js' extension if not using type: module
const Bill = require('../models/bill'); // Notice 'bill' file is in small case if your file is 'bill.js'
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
  
router.get('/api/all-bills', async (req, res) => {
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
    console.log("reached here")
  try {
    const { date, personName, amount, type, description, userId } = req.body;
    const photoUrl = req.file.path;
    console.log(photoUrl)

    const bill = new Bill({
      date,
      personName,
      amount,
      type,
      description,
      photoUrl,
      userId,
      status: 'pending', // default
    });

    await bill.save();

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

// PATCH - Approve or Reject a bill
router.patch('/update-bill-status/:billId', async (req, res) => {
  try {
    const { billId } = req.params;
    const { status } = req.body; // status = "approved" or "rejected"

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value' });
    }

    const updatedBill = await Bill.findByIdAndUpdate(
      billId,
      { status },
      { new: true }
    );

    if (!updatedBill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

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

module.exports = router;
