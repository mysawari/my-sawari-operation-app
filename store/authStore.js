import { create } from "zustand";
import api from "../services/api";
import { getStorage, removeStorage, setStorage } from "../utils/storage";

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  loading: false,
  initialized: false,

  setAuth: async (accessToken, user) => {
    await Promise.all([
      setStorage("accessToken", accessToken),
      setStorage("user", user),
    ]);

    api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;

    set({
      token: accessToken,
      user,
      loading: false,
      initialized: true,
    });
  },

  clearAuth: async () => {
    await Promise.all([removeStorage("accessToken"), removeStorage("user")]);

    delete api.defaults.headers.common.Authorization;

    set({
      token: null,
      user: null,
      loading: false,
      initialized: true,
    });
  },

  initializeAuth: async () => {
    try {
      const [token, user] = await Promise.all([
        getStorage("accessToken"),
        getStorage("user"),
      ]);

      if (!token || !user) {
        return set({
          token: null,
          user: null,
          initialized: true,
        });
      }

      api.defaults.headers.common.Authorization = `Bearer ${token}`;

      set({
        token,
        user,
        initialized: true,
      });
    } catch (error) {
      console.error("Initialize Auth:", error);

      set({
        token: null,
        user: null,
        initialized: true,
      });
    }
  },

  register: async (payload) => {
    try {
      set({ loading: true });

      const res = await api.post("/auth/register", payload);

      const { accessToken, user } = res.data.data;

      await useAuthStore.getState().setAuth(accessToken, user);

      return { success: true };
    } catch (error) {
      set({ loading: false });

      return {
        success: false,
        message: error?.response?.data?.message || "Registration failed",
      };
    }
  },

  login: async (emailOrMobile, password) => {
    try {
      set({ loading: true });

      const res = await api.post("/auth/login", {
        emailOrMobile,
        password,
      });

      const { accessToken, user } = res.data.data;

      await useAuthStore.getState().setAuth(accessToken, user);

      return { success: true };
    } catch (error) {
      set({ loading: false });

      return {
        success: false,
        message: error?.response?.data?.message || "Login failed",
      };
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.log("Logout API:", error?.message);
    }

    await useAuthStore.getState().clearAuth();
  },
}));

export default useAuthStore;
