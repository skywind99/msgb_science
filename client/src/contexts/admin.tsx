import { createContext, useContext, useState } from "react";

interface AdminContextType {
  isAdmin: boolean;
  password: string;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  password: "",
  login: async () => false,
  logout: () => {},
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [password, setPassword] = useState(() => localStorage.getItem("admin_pw") || "");
  const [isAdmin, setIsAdmin] = useState(() => !!localStorage.getItem("admin_pw"));

  const login = async (pwd: string): Promise<boolean> => {
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": pwd },
    });
    if (res.ok) {
      setPassword(pwd);
      setIsAdmin(true);
      localStorage.setItem("admin_pw", pwd);
      return true;
    }
    return false;
  };

  const logout = () => {
    setPassword("");
    setIsAdmin(false);
    localStorage.removeItem("admin_pw");
  };

  return (
    <AdminContext.Provider value={{ isAdmin, password, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
