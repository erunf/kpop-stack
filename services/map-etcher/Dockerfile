# Map Etcher Service
# Generates laser-etching artwork for beer can glasses

FROM python:3.11-slim

# Install system dependencies for matplotlib and geographic libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgeos-dev \
    libproj-dev \
    libgdal-dev \
    libcairo2-dev \
    libpango1.0-dev \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY fonts/ ./fonts/

# Create directories
RUN mkdir -p /app/cache /app/output

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV OUTPUT_DIR=/app/output
ENV PORT=5000

# Expose port
EXPOSE 5000

# Run the API server
CMD ["python", "src/api.py"]
