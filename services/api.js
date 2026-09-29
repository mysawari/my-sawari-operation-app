import axios from "axios";

const api = axios.create({
  baseURL: "https://my-sawari.onrender.com/api/v1",
  timeout: 60000,
});

export default api;
