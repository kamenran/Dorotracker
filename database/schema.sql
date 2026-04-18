CREATE DATABASE IF NOT EXISTS dorotracker;
USE dorotracker;

CREATE TABLE IF NOT EXISTS assignments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  due_date DATE NOT NULL,
  estimated_minutes INT NOT NULL,
  minutes_completed INT NOT NULL DEFAULT 0,
  priority INT NOT NULL DEFAULT 3,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  run_type ENUM('generate', 'reschedule') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
