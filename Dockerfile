# Stage 1: Build React App
FROM node:18-alpine as build
WORKDIR /app

# Accept build args for API key (supports both naming conventions)
ARG VITE_GEMINI_API_KEY
ARG GEMINI_API_KEY
# Use VITE_GEMINI_API_KEY if provided, otherwise use GEMINI_API_KEY
ENV VITE_GEMINI_API_KEY=${VITE_GEMINI_API_KEY:-$GEMINI_API_KEY}

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Python Backend
FROM python:3.11-slim
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy built frontend assets
COPY --from=build /app/dist ./dist

# Copy backend code (only Python files)
COPY main.py database.py models.py ./

# Expose port
EXPOSE 8000

# Run application
CMD ["python", "main.py"]
