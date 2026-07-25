const express = require('express');
const router = express.Router();
const Student = require('../models/Student.cjs');
const { v4: uuidv4 } = require('uuid');

// Get all students
router.get('/', async (req, res) => {
  try {
    const students = await Student.find().sort({ queuePosition: 1 });
    res.json(students);
  } catch (err) {
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
      queuePosition: count
    });
    
    await student.save();
    res.status(201).json(student);
  } catch (err) {
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
    const id = typeof candidate.id === 'string' ? candidate.id.trim().toUpperCase() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const department = typeof candidate.department === 'string' ? candidate.department.trim().toUpperCase() : '';
    
    if (!id || !name || !department) {
      rejected.push({ row: i + 1, id: id || null, reason: 'Missing required fields' });
      continue;
    }
    
    const existing = await Student.findOne({ student_id: id });
    if (existing) {
      rejected.push({ row: i + 1, id, reason: 'Duplicate student ID' });
      continue;
    }
    
    const student = new Student({
      student_id: id,
      name,
      department,
      queuePosition: currentCount++
    });
    await student.save();
    accepted.push(student);
  }
  
  res.status(201).json({ imported: accepted.length, rejected });
});

// Delete a student
router.delete('/:studentId', async (req, res) => {
  try {
    const student = await Student.findOneAndDelete({ student_id: req.params.studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update student details
router.patch('/:studentId', async (req, res) => {
  try {
    const { name, department } = req.body;
    const student = await Student.findOne({ student_id: req.params.studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    if (name) student.name = name;
    if (department) student.department = department;
    
    await student.save();
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
