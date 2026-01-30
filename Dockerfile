# Stage 1: Build React App
FROM node:18-alpine as build
WORKDIR /app
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
