# Docker Setup Guide

This guide will help you set up and run the project in a Docker environment using the provided `Dockerfile` and `docker-compose.yml`. Follow the steps below:

---

## Prerequisites

Before proceeding, ensure you have the following installed:

1. **Docker**:
   - Install Docker by following the official [Docker Installation Guide](https://docs.docker.com/get-docker/).
   - Verify the installation:
     ```bash
     docker --version
     ```

2. **Docker Compose**:
   - Docker Compose is included with Docker Desktop for Windows and macOS. For Linux, install it separately:
     ```bash
     sudo apt install docker-compose
     ```
   - Verify the installation:
     ```bash
     docker-compose --version
     ```

3. **Git**:
   - To clone the project repository, install Git:
     ```bash
     sudo apt install git
     ```

4. **Download Kaspa WASM**:
   - **IMPORTANT**: Download the latest WASM from [Kaspa Aspectron Nightly Builds](https://kaspa.aspectron.org/nightly/downloads/).

5. **GitHub Personal Access Token**:
   - Create a Personal Access Token following [GitHub's Guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token).
   - Update your username at Docker Login step in `./github/workflows/docker-image.yml`.
   - Add the token as a secret in your GitHub repository following [this guide](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository).

---

## Steps to Set Up the Project

### 1. Clone the Repository

Clone the project repository and navigate to the project directory:
```bash
git clone <repository-url>
cd <project-directory>
```
Replace `<repository-url>` with the actual repository URL.

   - Unzip the downloaded Kaspa WASM file and move the `nodejs` folder to the project repository. Rename it as `wasm` to match the structure expected by the code.
   - Validate the location by checking the imports in the code.

### 2. Review the Docker Compose File

Open the `docker-compose.yml` file and familiarize yourself with the services and configurations. Ensure that the ports and volumes do not conflict with other running applications on your system.

### 3. Build Docker Images

To build the Docker images defined in the `Dockerfile`, run:
```bash
docker-compose build
```
This command will create the necessary images for the project.

### 4. Run the Services

Start all the services defined in the `docker-compose.yml` file:
```bash
docker-compose up
```
- Add the `-d` flag to run in detached mode:
  ```bash
  docker-compose up -d
  ```
- Monitor logs if needed:
  ```bash
  docker-compose logs -f
  ```

### 5. Access the Application

Once all services are running, you can access the application in your browser or via API clients:

- **Frontend**:
  Visit [http://localhost:<frontend-port>](http://localhost:<frontend-port>) (Replace `<frontend-port>` with the actual port number).

- **Backend**:
  If applicable, the backend API will be available at [http://localhost:<backend-port>](http://localhost:<backend-port>).

---

## Managing the Environment

### Stop the Services
To stop all running services:
```bash
docker-compose down
```

### Restart Specific Services
To restart a specific service:
```bash
docker-compose restart <service-name>
```
Replace `<service-name>` with the name of the service from the `docker-compose.yml` file.

### Clean Up
Remove unused Docker images, containers, and volumes to free up space:
```bash
docker system prune -a
```
> **Note**: This will remove **all** unused resources.

---

## Troubleshooting

### 1. Docker Daemon Not Running
Ensure the Docker daemon is running. For Linux:
```bash
sudo systemctl start docker
```

### 2. Port Conflicts
If you encounter port conflicts, modify the `ports` section in `docker-compose.yml` to use different ports.

### 3. Permission Denied
If you encounter permission issues, try running Docker commands with `sudo` or add your user to the `docker` group:
```bash
sudo usermod -aG docker $USER
```
Log out and log back in to apply the changes.

### 4. Check Logs
For detailed error messages, check the container logs:
```bash
docker-compose logs <service-name>
```

---

## Additional Commands

### List Running Containers
```bash
docker ps
```

### Stop a Specific Container
```bash
docker stop <container-id>
```

### Remove a Container
```bash
docker rm <container-id>
```

### Remove an Image
```bash
docker rmi <image-id>
```

---

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Common Docker Commands Cheat Sheet](https://dockerlabs.collabnix.com/docker/cheatsheet/)

