# AGENT.md

# Graduation QR Photo Management System

> AI Agent Instructions, Architecture, Development Rules & Project Context

---

# Project Overview

This project is a complete Graduation Photography Automation Platform.

Its purpose is to completely eliminate manual photo sorting during graduation ceremonies.

Instead of photographers manually finding and sending images to hundreds of students, the system automatically detects the active student, uploads photographs to Google Drive, and organizes every image into the correct folder.

The system consists of multiple independent applications communicating in real time.

---

# Primary Goals

The system should:

- Control the order of students entering the stage.
- Automatically create Google Drive folders.
- Generate Digital QR Codes.
- Support Physical QR Cards.
- Automatically upload DSLR photos.
- Automatically organize photos.
- Support Photo Booth images.
- Allow multiple students in one image.
- Allow students to access their own photos.
- Require almost zero manual intervention.

---

# High Level Architecture

```
                    Admin Panel
                         │
                         │
              Student Queue Database
                         │
                         │
                Monitor Dashboard
                         │
          ┌──────────────┴──────────────┐
          │                             │
          │                             │
   Current Student               Folder Generator
          │                             │
          │                             │
          ▼                             ▼
   QR Generator                Google Drive API
          │                             │
          │                             │
          └──────────────┬──────────────┘
                         │
                  Student Folder
                         │
          ┌──────────────┴──────────────┐
          │                             │
          │                             │
    Stage Photography            Photo Booth
          │                             │
          ▼                             ▼
   Camera Upload Agent          Booth Upload Agent
          │                             │
          └──────────────┬──────────────┘
                         │
                     Google Drive
                         │
                         ▼
                  Student Downloads
```

---

# Applications

The project consists of several independent applications.

## 1. Admin Dashboard

Purpose:

Manage students.

Features:

- Import Excel
- Import CSV
- Manual Add
- Delete Student
- Edit Student
- Reorder Queue
- Search Student
- Assign Physical QR
- Generate Digital QR
- View Upload Status
- View Folder Status

---

## 2. Monitor Dashboard

Purpose:

Controls who goes onto the stage.

Only one student is active at a time.

Actions:

- Next Student
- Previous Student
- Skip
- Search
- Select Any Student
- Pause Queue

When a student becomes active:

- Folder is created
- QR is generated
- Camera App is notified
- Active student stored globally

---

## 3. Camera Upload Agent

Runs on photographer laptops.

Responsibilities:

- Detect newly captured images
- Read current active student
- Upload image
- Retry failed uploads
- Maintain upload queue
- Work offline
- Resume automatically

Never lose photographs.

---

## 4. Photo Booth

Self-service kiosk.

Workflow

Scan QR

↓

Identify Student(s)

↓

Take Photo

↓

Upload

↓

Store inside every student's folder

Supports:

- One QR
- Two QR
- Multiple QR
- Physical QR
- Digital QR

---

## 5. Student Portal

Students can

- Scan QR
- Login
- View Photos
- Download Photos
- Share Photos

No admin permissions.

---

# Student Lifecycle

```
Student Imported

↓

Student waits in Queue

↓

Monitor selects Student

↓

Folder Created

↓

QR Generated

↓

Stage Photos Uploaded

↓

Student Visits Booth

↓

More Photos Uploaded

↓

Student Downloads Photos
```

---

# Folder Structure

```
Graduation/

    2026/

        StudentID_Name/

            Stage/

            Booth/

            Originals/

            Edited/
```

Example

```
Graduation

    2026

        CEK001_Roshen_Reji

            Stage

            Booth

            Originals

            Edited
```

---

# QR Code Types

## Digital QR

Generated automatically.

Contains:

```
student_id

or

secure_token
```

---

## Physical QR

Pre-printed cards.

Workflow

Scan Card

↓

Assign Card

↓

Card permanently linked to Student

---

# QR Rules

Every QR must map to only one student.

Never expose internal database IDs publicly.

Instead use:

```
UUID

or

Secure Token
```

Example

```
photobooth.app/s/7Fd82jkLQm
```

---

# Stage Photography Workflow

Monitor clicks

```
Next Student
```

↓

Student becomes Active

↓

Folder Created

↓

Camera App receives Active Student

↓

Photographer takes images

↓

Images detected automatically

↓

Upload Queue

↓

Google Drive

↓

Student Folder

No manual file movement.

---

# Photo Booth Workflow

Scan QR

↓

Student identified

↓

Take Photo

↓

Upload

↓

Copy to Folder

---

# Group Photo Workflow

Supports

```
QR A

QR B

QR C

QR D
```

↓

Single Photograph

↓

Image uploaded

↓

Copied into

Student A

Student B

Student C

Student D

Every student receives the same image.

---

# Google Drive Rules

Every student owns exactly one folder.

Folder is created automatically.

Never create duplicates.

If folder exists:

Reuse.

---

# Upload Rules

Every upload should include

```
Student ID

Source

Timestamp

Camera

Filename
```

Sources

```
Stage

Booth
```

---

# Synchronization Rules

Uploads should never block photography.

Upload Queue

↓

Background Upload

↓

Retry Failed

↓

Mark Uploaded

---

# Offline Rules

If internet fails

Images remain local

↓

Queue preserved

↓

Auto upload later

Never lose data.

---

# Security

Students cannot access another student's folder.but there must be an admin

QR codes expire only if required.

Use signed tokens.

Never expose Google Drive IDs.

Authentication required for Admin.

Authentication required for Monitor.

---

# Tech Stack

Frontend

- Next.js
- React
- TypeScript
- TailwindCSS
- shadcn/ui

Backend

- NestJS
- Node.js

Database

- firestore

ORM

- Prisma

Authentication

- Clerk
- NextAuth

Realtime

- Socket.IO

Queue

- BullMQ

Redis

- Redis

Storage

- Google Drive

Uploader

- RClone

Camera Detection

- Python Watchdog
- Node Chokidar

QR

- ZXing
- OpenCV

Deployment

- Docker
- Railway
- VPS

---

# Database Models

Student

```
id

student_id

name

department

physical_qr

digital_qr

folder_id

status
```

Queue

```
id

student_id

position

active
```

Upload

```
id

student_id

filename

camera

uploaded

created_at
```

Photo

```
id

student_id

drive_url

thumbnail

type

created_at
```

QR Mapping

```
id

physical_code

student_id

assigned_at
```

---

# API Modules

Students

Queue

Authentication

QR

Drive

Uploads

Photo Booth

Downloads

Admin

Realtime

---

# Coding Principles

Always use TypeScript.

Strict typing.

No duplicated logic.

Reusable components.

Service-oriented architecture.

Dependency Injection.

Feature-first folder structure.

Atomic commits.

---

# Performance Goals

Support

- 300+ students
- 1000+ photos
- Multiple photographers
- Multiple booths
- Live updates
- Zero downtime


# Success Criteria

The project is considered complete when:

✓ Student import is automated

✓ Queue is manageable

✓ QR generation works

✓ Physical QR assignment works

✓ Stage uploads are automatic

✓ Booth uploads are automatic

✓ Multiple QR scanning works

✓ Google Drive synchronization is automatic

✓ Students can access their own photos

✓ No manual photo sorting is required

✓ No photo loss occurs under normal operation