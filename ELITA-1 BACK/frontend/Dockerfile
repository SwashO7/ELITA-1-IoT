# SmartBike Frontend Dockerfile (Development)
# Multi-stage could be added for production static build
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install || true
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
