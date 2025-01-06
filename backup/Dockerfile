FROM ubuntu:latest

# Use an official PostgreSQL image as the base
FROM postgres:latest

# Install cron
RUN apt-get update && apt-get install -y cron

# Create a directory for the backup scripts and files
RUN mkdir /backup

# Copy the backup script into the container
COPY backup.sh /backup/backup.sh

# Give execution rights on the backup script
RUN chmod +x /backup/backup.sh

# Create a crontab file
RUN echo "0 * * * * /backup/backup.sh >> /var/log/cron.log 2>&1" > /etc/cron.d/backup-cron

# Apply cron job
RUN crontab /etc/cron.d/backup-cron

# Create a log file for cron jobs
RUN touch /var/log/cron.log

# Create the directory where the backups will be stored
VOLUME ["/backup"]

# Run the command on container startup
CMD ["sh", "-c", "printenv > /etc/environment; cron -f"]