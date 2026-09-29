import AsyncStorage from "@react-native-async-storage/async-storage";

export const setStorage = async (key, value) => {
  try {
    const data = typeof value === "string" ? value : JSON.stringify(value);

    await AsyncStorage.setItem(key, data);

    return true;
  } catch (error) {
    if (__DEV__) {
      console.error(`Storage Set Error (${key}):`, error);
    }

    return false;
  }
};

export const getStorage = async (key) => {
  try {
    const value = await AsyncStorage.getItem(key);

    if (value === null) return null;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (error) {
    if (__DEV__) {
      console.error(`Storage Get Error (${key}):`, error);
    }

    return null;
  }
};

export const removeStorage = async (key) => {
  try {
    await AsyncStorage.removeItem(key);

    return true;
  } catch (error) {
    if (__DEV__) {
      console.error(`Storage Remove Error (${key}):`, error);
    }

    return false;
  }
};

export const multiSetStorage = async (items) => {
  try {
    const formattedItems = items.map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]);

    await AsyncStorage.multiSet(formattedItems);

    return true;
  } catch (error) {
    if (__DEV__) {
      console.error("Storage MultiSet Error:", error);
    }

    return false;
  }
};

export const multiRemoveStorage = async (keys) => {
  try {
    await AsyncStorage.multiRemove(keys);

    return true;
  } catch (error) {
    if (__DEV__) {
      console.error("Storage MultiRemove Error:", error);
    }

    return false;
  }
};

export const clearStorage = async () => {
  try {
    await AsyncStorage.clear();

    return true;
  } catch (error) {
    if (__DEV__) {
      console.error("Storage Clear Error:", error);
    }

    return false;
  }
};
