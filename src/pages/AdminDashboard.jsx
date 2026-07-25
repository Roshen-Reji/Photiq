import React, { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const [students, setStudents] = useState([]);
  const [csvData, setCsvData] = useState('');

  useEffect(() => {
    fetch('/api/students')
      .then(res => res.json())
      .then(data => setStudents(data))
      .catch(err => console.error(err));
  }, []);

  const handleImport = async () => {
    // Basic CSV parsing for demo
    const rows = csvData.split('\n').slice(1);
    const parsed = rows.map(r => {
      const [id, name, department] = r.split(',');
      return { id, name, department };
    }).filter(s => s.id);

    await fetch('/api/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: parsed })
    });
    
    // Refresh
    const res = await fetch('/api/students');
    setStudents(await res.json());
  };

  return (
    <div className="admin-container" style={{ padding: '2rem' }}>
      <h1>Admin Dashboard</h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <h2>Import CSV Roster</h2>
        <textarea 
          placeholder="Student ID,Name,Department\n123,John Doe,CS" 
          rows="5" 
          value={csvData}
          onChange={e => setCsvData(e.target.value)}
          style={{ width: '100%', marginBottom: '1rem' }}
        />
        <button onClick={handleImport}>Import</button>
      </div>
      
      <h2>Student Roster</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>ID</th>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'left' }}>Department</th>
            <th style={{ textAlign: 'left' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {students.map(s => (
            <tr key={s.student_id}>
              <td>{s.student_id}</td>
              <td>{s.name}</td>
              <td>{s.department}</td>
              <td>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
