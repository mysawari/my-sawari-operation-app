import axios from "axios";

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || "http://192.168.29.131:5002/api/v1",
  timeout: 60000,
});

export default api;
