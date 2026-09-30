import axios from "axios";

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || "https://mysawari-operation-backend.onrender.com/api/v1",
  timeout: 60000,
});

export default api;
