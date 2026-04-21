CREATE DATABASE IF NOT EXISTS dorotracker;
USE dorotracker;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  title VARCHAR(255) NOT NULL,
  due_date DATE NOT NULL,
  estimated_minutes INT NOT NULL,
  minutes_completed INT NOT NULL DEFAULT 0,
  priority INT NOT NULL DEFAULT 3,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assignment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  run_type ENUM('generate', 'reschedule') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_schedule_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  run_id INT NOT NULL,
  assignment_id INT NULL,
  assignment_title VARCHAR(255) NOT NULL,
  due_date DATE NOT NULL,
  scheduled_date DATE NOT NULL,
  minutes INT NOT NULL,
  pomodoros INT NOT NULL,
  priority INT NOT NULL,
  overdue TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_schedule_run FOREIGN KEY (run_id) REFERENCES schedule_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  assignment_id INT NULL,
  assignment_title VARCHAR(255) NULL,
  session_type ENUM('focus', 'short_break', 'long_break') NOT NULL DEFAULT 'focus',
  planned_minutes INT NOT NULL,
  actual_minutes INT NOT NULL,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_study_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_study_session_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_commitments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  label VARCHAR(255) NOT NULL,
  day_of_week TINYINT NULL,
  blocked_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_commitment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
