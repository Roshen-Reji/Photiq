# RClone Installation & Configuration Guide

RClone is required for the system to automatically upload stage and photo booth pictures to Google Drive. Because connecting to Google Drive requires a web browser to grant permissions, **you must run these steps manually in your terminal**.

## 1. Install RClone (Windows)

Open a **new** PowerShell window and run the following command to download and install RClone:

```powershell
Invoke-WebRequest https://downloads.rclone.org/rclone-current-windows-amd64.zip -OutFile rclone.zip
Expand-Archive rclone.zip -DestinationPath C:\rclone
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\rclone\rclone-v1.65.2-windows-amd64", [EnvironmentVariableTarget]::User)
```
*(Note: You may need to restart your terminal after this or use `winget install Rclone.Rclone` if you have winget).*

To verify the installation, type:
```powershell
rclone version
```

## 2. Configure Google Drive

Once RClone is installed, run the configuration wizard:

```powershell
rclone config
```

You will enter an interactive menu. Follow these precise steps:

1. **`n`** - New remote.
2. **`name`** - Type **`drive`** (this matches the default `GRADSYNC_RCLONE_REMOTE` in your `.env` file).
3. **`Storage`** - Type **`drive`** (for Google Drive) and press Enter.
4. **`client_id`** - Leave blank and press Enter.
5. **`client_secret`** - Leave blank and press Enter.
6. **`scope`** - Type **`1`** (Full access all files, excluding Application Data Folder).
7. **`service_account_file`** - Leave blank and press Enter.
8. **`Edit advanced config?`** - Type **`n`** and press Enter.
9. **`Use auto config?`** - Type **`y`** and press Enter. 
   *(This will pop open your web browser. Log into the Google Account where you want the graduation photos saved and click "Allow".)*
10. **`Configure this as a Shared Drive (Team Drive)?`** - Type **`n`** (unless you are specifically using a Google Workspace Shared Drive).
11. **`Keep this "drive" remote?`** - Type **`y`** to save.
12. **`q`** - Quit config.

## 3. Verify it works!

To check if RClone is successfully talking to your Google Drive, run:

```powershell
rclone lsd drive:
```
This should list the top-level folders currently inside your Google Drive!

> [!TIP]
> **Photographer Laptops:** You will need to repeat this identical process on any laptop that is tethered to a camera running the `camera-upload-agent.cjs`.
