const express = require('express');
const router = express.Router();
const Student = require('../models/Student.cjs');
const { v4: uuidv4 } = require('uuid');

// Get all students
router.get('/', async (req, res) => {
  try {
    const students = await Student.find().sort({ queuePosition: 1 }).lean();
    
    // Batch backfill any missing digital_qr fields in legacy DB records
    const needsBackfill = students.filter(s => !s.digital_qr);
    if (needsBackfill.length > 0) {
      const bulkOps = needsBackfill.map(s => ({
        updateOne: {
          filter: { _id: s._id },
          update: { $set: { digital_qr: uuidv4() } }
        }
      }));
      await Student.bulkWrite(bulkOps);
      
      // Refresh to get updated values
      const refreshed = await Student.find().sort({ queuePosition: 1 }).lean();
      return res.json(refreshed);
    }
    
    res.json(students);
  } catch (err) {
    console.error('Fetch students error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add a single student
router.post('/', async (req, res) => {
  try {
    const { id, name, department } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'Student ID and name are required' });
    
    const existing = await Student.findOne({ student_id: id });
    if (existing) return res.status(409).json({ error: 'Student ID already exists' });
    
    const count = await Student.countDocuments();
    const student = new Student({
      student_id: id,
      name,
      department,
      digital_qr: uuidv4(),
      queuePosition: count
    });
    
    await student.save();

    // Emit socket event for real-time sync (Fix 3)
    const io = req.app.get('io');
    if (io) {
      io.emit('student_added', student);
      io.emit('system_log', {
        time: new Date().toLocaleTimeString(),
        level: 'ok',
        message: `STUDENT ADDED: ${student.name} (${student.student_id})`
      });
    }

    res.status(201).json(student);
  } catch (err) {
    console.error('Add student error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Import multiple students (CSV/Excel)
router.post('/import', async (req, res) => {
  const candidates = Array.isArray(req.body.students) ? req.body.students : null;
  if (!candidates?.length) return res.status(400).json({ error: 'Provide at least one student' });
  
  const accepted = [];
  const rejected = [];
  
  let currentCount = await Student.countDocuments();
  
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    let name = candidate.name !== undefined && candidate.name !== null ? String(candidate.name).trim() : '';
    let department = candidate.department !== undefined && candidate.department !== null ? String(candidate.department).trim().toUpperCase() : 'GENERAL';
    let id = candidate.id !== undefined && candidate.id !== null ? String(candidate.id).trim().toUpperCase() : '';
    
    // Only student name is required
    if (!name) {
      rejected.push({ row: i + 1, id: id || null, reason: 'Missing student name' });
      continue;
    }

    // Auto-generate student ID if missing or empty
    if (!id) {
      let nextNum = currentCount + 1;
      id = `STU-${String(nextNum).padStart(4, '0')}`;
      while (await Student.findOne({ student_id: id })) {
        nextNum++;
        id = `STU-${String(nextNum).padStart(4, '0')}`;
      }
    } else {
      // If student ID already exists, make it unique with a suffix instead of rejecting
      let originalId = id;
      let suffix = 1;
      while (await Student.findOne({ student_id: id })) {
        id = `${originalId}_${suffix}`;
        suffix++;
      }
    }
    
    const student = new Student({
      student_id: id,
      name,
      department,
      digital_qr: uuidv4(),
      queuePosition: currentCount++
    });
    await student.save();
    accepted.push(student);
  }

  // Emit socket event for real-time sync (Fix 3)
  const io = req.app.get('io');
  if (io && accepted.length > 0) {
    io.emit('students_imported', { count: accepted.length, students: accepted });
    io.emit('system_log', {
      time: new Date().toLocaleTimeString(),
      level: 'ok',
      message: `BATCH IMPORT: ${accepted.length} students added`
    });
  }
  
  res.status(201).json({ imported: accepted.length, rejected });
});

// Delete a student
router.delete('/:studentId', async (req, res) => {
  try {
    const student = await Student.findOneAndDelete({ student_id: req.params.studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Emit socket event for real-time sync (Fix 3)
    const io = req.app.get('io');
    if (io) {
      io.emit('student_deleted', { student_id: req.params.studentId });
      io.emit('system_log', {
        time: new Date().toLocaleTimeString(),
        level: 'warn',
        message: `STUDENT REMOVED: ${student.name} (${student.student_id})`
      });
    }

    res.sendStatus(204);
  } catch (err) {
    console.error('Delete student error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update student details
router.patch('/:studentId', async (req, res) => {
  try {
    const { name, department, physical_qr, id } = req.body;
    const student = await Student.findOne({ student_id: req.params.studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    if (name) student.name = name;
    if (department !== undefined) student.department = department; // department can be empty
    if (physical_qr !== undefined) student.physical_qr = physical_qr;
    if (id && id !== student.student_id) student.student_id = id;
    
    await student.save();

    // Emit socket event for real-time sync (Fix 3)
    const io = req.app.get('io');
    if (io) {
      io.emit('student_updated', student);
    }

    res.json(student);
  } catch (err) {
    console.error('Update student error:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
