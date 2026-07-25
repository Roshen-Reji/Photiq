import React, { useState, useEffect } from 'react';

export default function MonitorDashboard() {
  const [students, setStudents] = useState([]);
  const [activeStudent, setActiveStudent] = useState(null);

  useEffect(() => {
    fetch('/api/students')
      .then(res => res.json())
      .then(data => setStudents(data))
      .catch(err => console.error(err));
      
    fetch('/api/queue/active')
      .then(res => res.json())
      .then(data => setActiveStudent(data))
      .catch(err => console.error(err));
  }, []);

  const handleNext = async (id) => {
    const res = await fetch('/api/queue/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id })
    });
    const updated = await res.json();
    setActiveStudent(updated);
  };

  return (
    <div className="brutalist-container">
      <div className="panel queue-panel">
        <h2>[QUEUE_VIEW]</h2>
        {students.map(s => (
          <div key={s.student_id} className="queue-item">
            <span>{s.student_id} - {s.name}</span>
            <button onClick={() => handleNext(s.student_id)}>[SELECT]</button>
          </div>
        ))}
      </div>
      <div className="panel active-panel">
        <h2>[ACTIVE_NODE]</h2>
        {activeStudent ? (
          <div className="active-display">
            <h1>{activeStudent.name.toUpperCase()}</h1>
            <p className="status-indicator">[SYNCING...]</p>
          </div>
        ) : (
          <p>NO ACTIVE STUDENT</p>
        )}
      </div>
      <div className="panel log-panel">
        <h2>[SYSTEM_LOG]</h2>
        <p>{'> SYSTEM READY'}</p>
      </div>
    </div>
  );
}
