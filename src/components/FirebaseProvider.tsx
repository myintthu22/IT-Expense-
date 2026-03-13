import React, { createContext, useContext, useEffect, useState } from 'react';

// Mock User type to replace Firebase User
interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | null>(null);

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useFirebase must be used within FirebaseProvider');
  return context;
};

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize with a mock user so it's always logged in
  const [user, setUser] = useState<User | null>({
    uid: 'local-user-123',
    email: 'local@example.com',
    displayName: 'Local User',
    photoURL: null
  });
  const [loading, setLoading] = useState(false);

  // Mock signIn function
  const signIn = async () => {
    setUser({
      uid: 'local-user-123',
      email: 'local@example.com',
      displayName: 'Local User',
      photoURL: null
    });
  };

  // Mock logOut function
  const logOut = async () => {
    setUser(null);
  };

  return (
    <FirebaseContext.Provider value={{ user, loading, signIn, logOut }}>
      {children}
    </FirebaseContext.Provider>
  );
};
