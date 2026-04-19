# DoroTracker

DoroTracker is a Node.js prototype for assignment tracking, schedule generation, schedule regeneration, and Pomodoro-oriented study planning.

## What already works here

This base is intentionally light outside of the scheduler lane, but Kamran's feature is wired end to end:

- add one assignment at a time
- store assignments in MySQL
- generate a study schedule from deadlines, effort, and daily study limits
- reschedule after telling the app you completed work or missed work
- save generated schedule blocks in MySQL

The app uses:

- Node.js for the backend and scheduling flow
- MySQL for persistence
- a lightweight frontend styled around the DoroTracker logo colors

## Fresh machine setup

If you are opening this project on a brand new computer, you need two things installed first:

- Node.js
- MySQL

Installing only MySQL is not enough.
Installing only Node.js is not enough.
You need both.

## Mac setup

### 1. Install Homebrew

Open Terminal and run:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install Node.js and MySQL

In Terminal, run:

```bash
brew install node
brew install mysql
```

### 3. Start MySQL

Run:

```bash
brew services start mysql
```

### 4. Download the project

Either:

- download the ZIP from GitHub and extract it
- or clone it with Git:

```bash
git clone https://github.com/kamenran/Dorotracker.git
cd Dorotracker
git checkout kamran-feature
```

### 5. Install project dependencies

Inside the project folder, run:

```bash
npm install
```

### 6. Create the database and tables

Still inside the project folder, run:

```bash
mysql -u root < database/schema.sql
```

If your MySQL setup asks for a password, use:

```bash
mysql -u root -p < database/schema.sql
```

### 7. Start the app

You can either double click:

- [MAC DOUBLE CLICK.command](/Users/kamraneisenberg/Documents/Dorotracker/MAC%20DOUBLE%20CLICK.command)

Or run:

```bash
./scripts/start_app.sh
```

### 8. Open the site

Go to:

```text
http://127.0.0.1:8000
```

## Windows setup

### 1. Install Node.js

Download and install Node.js from:

- [https://nodejs.org/](https://nodejs.org/)

### 2. Install MySQL

Install MySQL Community Server or MySQL Installer from:

- [https://dev.mysql.com/downloads/](https://dev.mysql.com/downloads/)

Make sure the MySQL server is actually running after installation.

### 3. Download the project

Either:

- download the ZIP from GitHub and extract it
- or clone it with Git:

```bash
git clone https://github.com/kamenran/Dorotracker.git
cd Dorotracker
git checkout kamran-feature
```

### 4. Install project dependencies

In Command Prompt or PowerShell, inside the project folder, run:

```bash
npm install
```

### 5. Create the database and tables

If MySQL is on your PATH, run:

```bash
mysql -u root -p < database/schema.sql
```

If `mysql` is not recognized, open the MySQL Command Line Client or use the full path to `mysql.exe`.

### 6. Start the app

You can either double click:

- `WINDOWS DOUBLE CLICK.bat`

Or run:

```bash
node server/index.js
```

### 7. Open the site

Go to:

```text
http://127.0.0.1:8000
```

## What the project expects

The local development setup assumes:

- MySQL database name: `dorotracker`
- MySQL user: `root` unless changed in environment variables
- Windows MySQL host: `127.0.0.1`
- Windows MySQL port: `3306`
- Mac Homebrew MySQL socket: `/tmp/mysql.sock`

## Common problems

### `npm: command not found`

Node.js is not installed correctly. Reinstall Node.js and reopen Terminal or Command Prompt.

### `mysql: command not found`

MySQL is not installed correctly, or its command line tools are not on your PATH.

### `Can't connect to MySQL server`

MySQL is installed, but the MySQL server is not running yet.

On Mac, try:

```bash
brew services start mysql
```

On Windows, start the MySQL service from Services or MySQL Installer.

### The site opens but buttons do nothing

Usually this means the backend is not running or MySQL is not connected correctly.

### Port `8000` already in use

Another copy of the app is already running. Close the old one first, then start it again.

## Quick summary

For a fresh machine, the full local setup is:

1. Install Node.js
2. Install MySQL
3. Start MySQL
4. Download the repo
5. Run `npm install`
6. Run the schema file
7. Start the app
8. Open `http://127.0.0.1:8000`

## Final note

For local development, each person still needs their own MySQL installation.

For a final demo where users should not install anything locally, the better approach is to deploy the app online with a cloud-hosted MySQL database.

## Recommended cloud setup

If you want the app to open from a real link and still use MySQL, the cleanest option is:

- host the app on Railway
- host the database on Aiven

That gives you:

- a live website link for the project
- a real MySQL database
- the ability to connect MySQL Workbench to the same database
- a clean demo where actions in the app appear in the database live

## Railway environment variables

If you deploy this app to Railway, add these environment variables in the Railway project:

- `HOST=0.0.0.0`
- `PORT=8000`
- `MYSQL_HOST=your-aiven-host`
- `MYSQL_PORT=your-aiven-port`
- `MYSQL_USER=your-aiven-user`
- `MYSQL_PASSWORD=your-aiven-password`
- `MYSQL_DATABASE=dorotracker`
- `MYSQL_SOCKET=`
- `MYSQL_SSL_MODE=required`
- `MYSQL_SSL_CA_CONTENT=paste the full Aiven CA certificate here`

Use `MYSQL_SSL_CA_CONTENT` for Railway or another hosted platform.
Use `MYSQL_SSL_CA` only for local development when the certificate is stored as a file on your own machine.
