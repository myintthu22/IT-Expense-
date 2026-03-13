import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  HardDrive, 
  BarChart3, 
  Upload, 
  Search, 
  Download,
  Plus,
  Filter,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  History,
  Key,
  Calendar,
  UserPlus,
  UserMinus,
  FileSignature,
  RotateCcw,
  Wrench,
  MapPin,
  Bookmark,
  Ban,
  MoreVertical,
  Image as ImageIcon,
  Printer,
  Edit2,
  Cpu,
  FileCode
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import * as xlsx from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type } from "@google/genai";
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { useFirebase } from './components/FirebaseProvider';

const EXCHANGE_RATE = 4500; // 1 USD = 4500 Kyats

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Safe date formatting
const formatDate = (dateStr: string | undefined | null, formatStr: string = 'MMM dd, yyyy') => {
  if (!dateStr) return 'N/A';
  try {
    const date = parseISO(dateStr);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return format(date, formatStr);
  } catch (error) {
    return 'Invalid Date';
  }
};

// Types
interface Expense {
  id: string;
  payment_date: string;
  vendor: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  payment_method: string;
  invoice_number: string;
  type: 'Asset' | 'Expense';
  user?: string;
  image_url?: string;
}

interface Asset {
  id: string;
  expense_id: string;
  asset_name: string;
  purchase_date: string;
  cost: number;
  vendor: string;
  serial_number: string;
  assigned_to: string;
  user?: string;
  status: string;
  warranty_expiry?: string;
  department?: string;
  location?: string;
  image_url?: string;
  asset_tag?: string;
  category?: string;
}

interface AssetHistory {
  id: string;
  asset_id: string;
  change_date: string;
  status: string;
  assigned_to: string;
  notes: string;
}

interface License {
  id: string;
  software_name: string;
  vendor: string;
  license_key: string;
  start_date: string;
  end_date: string;
  cost: number;
  currency: string;
  status: string;
  assigned_to: string;
}

interface Stats {
  monthlySpending: { month: string; total: number }[];
  categorySpending: { category: string; total: number }[];
  vendorSpending: { vendor: string; total: number }[];
  typeSpending: { type: string; total: number }[];
  assetAllocationByDepartment: { department: string; count: number }[];
  assetAllocationByLocation: { location: string; count: number }[];
  summary: {
    totalSpending: number;
    totalCount: number;
    totalOpEx: number;
    totalCapEx: number;
    activeAssetsCount: number;
  };
}

interface Activity {
  id: string;
  action_type: string;
  entity_type: string;
  description: string;
  timestamp: string;
}

// Components
const Card = ({ children, className }: { children: React.ReactNode; className?: string; key?: React.Key }) => (
  <div className={cn("bg-white rounded-2xl border border-slate-200 shadow-sm", className)}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled,
  type = 'button',
  icon: Icon
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  icon?: any;
}) => {
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800',
    secondary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    outline: 'border border-slate-200 text-slate-700 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-500 text-white hover:bg-red-600'
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      type={type}
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className
      )}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'info' | 'danger' | 'purple' | 'indigo' }) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    info: 'bg-blue-100 text-blue-700',
    danger: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    indigo: 'bg-indigo-100 text-indigo-700'
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold", variants[variant])}>
      {children}
    </span>
  );
};

const ActionMenuItem = ({ icon: Icon, label, onClick, variant = 'default' }: { icon: any; label: string; onClick: (e: React.MouseEvent) => void; variant?: 'default' | 'danger' }) => (
  <button 
    onClick={(e) => {
      e.stopPropagation();
      onClick(e);
    }}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
      variant === 'danger' ? "text-red-500 hover:bg-red-50" : "text-slate-600 hover:bg-slate-50"
    )}
  >
    <Icon size={16} />
    <span>{label}</span>
  </button>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'assets' | 'licenses' | 'analytics' | 'activities'>('dashboard');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Asset' | 'Expense'>('All');
  const [assetStatusFilter, setAssetStatusFilter] = useState<string>('All');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [assetAction, setAssetAction] = useState<{
    type: 'Check out' | 'Check in' | 'Lease' | 'Lease Return' | 'Dispose' | 'Maintenance' | 'Move' | 'Reserve';
    assets: Asset[];
  } | null>(null);
  const [actionData, setActionData] = useState({
    assigned_to: '',
    location: '',
    department: '',
    notes: ''
  });
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  const [assetHistory, setAssetHistory] = useState<AssetHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    type: 'Expense',
    currency: 'Kyats',
    user: '',
    image_url: ''
  });
  const [newAsset, setNewAsset] = useState<Partial<Asset>>({
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    status: 'Active',
    warranty_expiry: '',
    department: '',
    location: '',
    user: '',
    image_url: '',
    category: 'Hardware'
  });
  const [newLicense, setNewLicense] = useState<Partial<License>>({
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), 'yyyy-MM-dd'),
    status: 'Active',
    currency: 'Kyats'
  });

  const { user, loading: authLoading, signIn, logOut } = useFirebase();

  const [dashboardFilters, setDashboardFilters] = useState({
    startDate: '',
    endDate: '',
    category: 'All'
  });

  useEffect(() => {
    if (!user) return;

    setLoading(true);

    const expensesQuery = query(collection(db, 'expenses'), where('userId', '==', user.uid));
    const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(data);
    });

    const assetsQuery = query(collection(db, 'assets'), where('userId', '==', user.uid));
    const unsubAssets = onSnapshot(assetsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
      setAssets(data);
    });

    const licensesQuery = query(collection(db, 'licenses'), where('userId', '==', user.uid));
    const unsubLicenses = onSnapshot(licensesQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as License));
      setLicenses(data);
    });

    const activitiesQuery = query(collection(db, 'system_activities'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
    const unsubActivities = onSnapshot(activitiesQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
      setActivities(data);
    });

    setLoading(false);

    return () => {
      unsubExpenses();
      unsubAssets();
      unsubLicenses();
      unsubActivities();
    };
  }, [user]);

  // Calculate stats locally since we have all data
  useEffect(() => {
    if (!expenses.length && !assets.length) return;

    // Filter expenses based on dashboardFilters
    let filteredExp = expenses;
    if (dashboardFilters.startDate) {
      filteredExp = filteredExp.filter(e => e.payment_date >= dashboardFilters.startDate);
    }
    if (dashboardFilters.endDate) {
      filteredExp = filteredExp.filter(e => e.payment_date <= dashboardFilters.endDate);
    }
    if (dashboardFilters.category !== 'All') {
      filteredExp = filteredExp.filter(e => e.category === dashboardFilters.category);
    }

    const totalSpending = filteredExp.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalOpEx = filteredExp.filter(e => e.type === 'Expense').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalCapEx = filteredExp.filter(e => e.type === 'Asset').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const activeAssetsCount = assets.filter(a => ['In Stock', 'In Use', 'Active'].includes(a.status)).length;

    // Group by category
    const catMap = new Map<string, number>();
    filteredExp.forEach(e => {
      catMap.set(e.category, (catMap.get(e.category) || 0) + Number(e.amount || 0));
    });
    const categorySpending = Array.from(catMap.entries()).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);

    // Group by vendor
    const vendorMap = new Map<string, number>();
    filteredExp.forEach(e => {
      vendorMap.set(e.vendor, (vendorMap.get(e.vendor) || 0) + Number(e.amount || 0));
    });
    const vendorSpending = Array.from(vendorMap.entries()).map(([vendor, total]) => ({ vendor, total })).sort((a, b) => b.total - a.total).slice(0, 5);

    // Group by type
    const typeMap = new Map<string, number>();
    filteredExp.forEach(e => {
      typeMap.set(e.type, (typeMap.get(e.type) || 0) + Number(e.amount || 0));
    });
    const typeSpending = Array.from(typeMap.entries()).map(([type, total]) => ({ type, total })).sort((a, b) => b.total - a.total);

    // Group by month
    const monthMap = new Map<string, number>();
    filteredExp.forEach(e => {
      const month = e.payment_date.substring(0, 7);
      monthMap.set(month, (monthMap.get(month) || 0) + Number(e.amount || 0));
    });
    const monthlySpending = Array.from(monthMap.entries()).map(([month, total]) => ({ month, total })).sort((a, b) => a.month.localeCompare(b.month));

    // Asset allocation by department
    const deptMap = new Map<string, number>();
    assets.forEach(a => {
      const dept = a.department || 'Unassigned';
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    });
    const assetAllocationByDepartment = Array.from(deptMap.entries()).map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count);

    // Asset allocation by location
    const locMap = new Map<string, number>();
    assets.forEach(a => {
      const loc = a.location || 'Unassigned';
      locMap.set(loc, (locMap.get(loc) || 0) + 1);
    });
    const assetAllocationByLocation = Array.from(locMap.entries()).map(([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count);

    setStats({
      monthlySpending,
      categorySpending,
      vendorSpending,
      typeSpending,
      assetAllocationByDepartment,
      assetAllocationByLocation,
      summary: {
        totalSpending,
        totalCount: filteredExp.length,
        totalOpEx,
        totalCapEx,
        activeAssetsCount
      }
    });
  }, [expenses, assets, dashboardFilters]);

  const logActivity = async (action_type: string, entity_type: string, description: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'system_activities'), {
        action_type,
        entity_type,
        description,
        timestamp: new Date().toISOString(),
        userId: user.uid
      });
    } catch (error) {
      console.error("Activity logging error:", error);
    }
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchesSearch = 
        exp.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'All' || exp.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [expenses, searchTerm, filterType]);

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchesSearch = 
        asset.asset_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (asset.serial_number && asset.serial_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (asset.assigned_to && asset.assigned_to.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = assetStatusFilter === 'All' || asset.status === assetStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [assets, searchTerm, assetStatusFilter]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Key size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">IT Asset Manager</h2>
          <p className="text-slate-600 mb-8">Sign in to manage your organization's IT assets, expenses, and licenses securely.</p>
          <Button onClick={signIn} className="w-full h-12 text-base">
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Upload to get extracted text
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        },
        body: formData
      });
      
      if (!uploadRes.ok) throw new Error("Failed to upload file");
      const { extractedText } = await uploadRes.json();

      // 2. Call Gemini from frontend
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract IT asset and expense data from the following text/data. 
        The data could be from a "Reimbursement of Expenses" form, a "Payment Requisition Form", or a generic Excel/CSV list of old records.
        
        Guidelines:
        - Identify individual records. Each record should represent one purchase or expense.
        - Vendor: The company or person paid.
        - Payment Date: The date of transaction (format YYYY-MM-DD).
        - Description: What was purchased (e.g., "MacBook Pro", "AWS Subscription", "Office Chairs").
        - Category: Classify into Laptop, Hardware, Software, Internet, Maintenance, Office Supplies, Printer and Toner consumable, Printer service, or Other. 
          Note: Any laptop brands like Dell, Asus, Acer, HP, Lenovo, MacBook, ThinkPad, etc., should be categorized as 'Laptop' even if the word 'laptop' is not explicitly mentioned.
        - Amount: The numeric cost.
        - Currency: Default to 'Kyats' if not specified.
        - Type: 
          - 'Asset' for durable hardware (Laptops, Servers, Monitors, Printers, Networking gear).
          - 'Expense' for recurring costs, services, software, or low-value consumables.
        
        Return a JSON array of objects with these fields: 
        - payment_date (YYYY-MM-DD)
        - vendor (The payee or company name)
        - description (Nature of expense or description)
        - category (e.g., Laptop, Hardware, Software, Internet, Maintenance, etc.)
        - amount (numeric value only)
        - currency (e.g., 'Kyats', 'USD', 'HKD')
        - payment_method (e.g., 'Cash', 'Cheque', 'Transfer')
        - invoice_number (Reference No or REF)
        - type ('Asset' or 'Expense')
        
        Data: ${extractedText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                payment_date: { type: Type.STRING },
                vendor: { type: Type.STRING },
                description: { type: Type.STRING },
                category: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                currency: { type: Type.STRING },
                payment_method: { type: Type.STRING },
                invoice_number: { type: Type.STRING },
                type: { type: Type.STRING },
              },
              required: ["payment_date", "vendor", "description", "category", "amount", "type"],
            },
          },
        },
      });

      const records = JSON.parse(response.text);

      // 3. Save records to backend
      if (!user) {
        throw new Error("User not authenticated");
      }
      const batch = writeBatch(db);
      records.forEach((record: any) => {
        const expenseRef = doc(collection(db, 'expenses'));
        batch.set(expenseRef, {
          ...record,
          userId: user.uid,
          createdAt: new Date().toISOString()
        });

        if (record.type === 'Asset') {
          const assetRef = doc(collection(db, 'assets'));
          batch.set(assetRef, {
            expense_id: expenseRef.id,
            asset_name: record.description,
            status: 'In Stock',
            assigned_to: '',
            category: record.category,
            vendor: record.vendor,
            cost: record.amount,
            purchase_date: record.payment_date,
            userId: user.uid,
            createdAt: new Date().toISOString()
          });
        }
      });
      await batch.commit();
      await logActivity('ADD', 'Bulk Import', `Imported ${records.length} records`);
      
      setUploadSuccess(`Successfully imported ${records.length} records!`);
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (error) {
      console.error("Upload/Process error:", error);
      alert("Error processing file. Please check your API key and file format.");
    } finally {
      setUploading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      if (editingExpense) {
        await updateDoc(doc(db, 'expenses', editingExpense.id), {
          ...editingExpense,
          userId: user.uid
        });
        await logActivity('UPDATE', 'Expense', `Updated expense: ${editingExpense.vendor}`);
      } else {
        const batch = writeBatch(db);
        const expenseRef = doc(collection(db, 'expenses'));
        batch.set(expenseRef, {
          ...newExpense,
          userId: user.uid,
          createdAt: new Date().toISOString()
        });

        if (newExpense.type === 'Asset') {
          const assetRef = doc(collection(db, 'assets'));
          batch.set(assetRef, {
            expense_id: expenseRef.id,
            asset_name: newExpense.description,
            status: 'In Stock',
            assigned_to: newExpense.user || '',
            category: newExpense.category,
            userId: user.uid,
            createdAt: new Date().toISOString()
          });
        }
        await batch.commit();
        await logActivity('ADD', newExpense.type || 'Expense', `Added ${newExpense.type}: ${newExpense.vendor} - ${newExpense.description}`);
      }

      setShowExpenseModal(false);
      setEditingExpense(null);
      setNewExpense({
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        type: 'Expense',
        currency: 'Kyats',
        user: '',
        image_url: ''
      });
    } catch (error) {
      console.error("Save expense error:", error);
    }
  };

  const generateAssetTag = (category: string) => {
    const prefix = category ? category.substring(0, 3).toUpperCase() : 'AST';
    const categoryAssets = assets.filter(a => a.category === category && a.asset_tag?.startsWith(`${prefix}-`));
    let maxNumber = 0;
    categoryAssets.forEach(a => {
      const match = a.asset_tag?.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });
    return `${prefix}-${(maxNumber + 1).toString().padStart(3, '0')}`;
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const assetTag = newAsset.asset_tag || generateAssetTag(newAsset.category || 'Hardware');
      await addDoc(collection(db, 'assets'), {
        ...newAsset,
        asset_tag: assetTag,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
      await logActivity('ADD', 'Asset', `Added asset: ${newAsset.asset_name}`);
      setShowAssetModal(false);
      setEditingAsset(null);
      setNewAsset({
        purchase_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'Active',
        warranty_expiry: '',
        department: '',
        location: '',
        user: '',
        image_url: '',
        category: 'Hardware'
      });
    } catch (error) {
      console.error("Save asset error:", error);
    }
  };

  const printAssetLabels = (assetsToPrint: Asset[]) => {
    if (assetsToPrint.length === 0) return;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [50, 25] // Small label size
    });

    assetsToPrint.forEach((asset, index) => {
      if (index > 0) doc.addPage([50, 25], 'landscape');
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("FIXED ASSET", 25, 6, { align: "center" });
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(asset.asset_name.substring(0, 25), 25, 12, { align: "center" });
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(asset.asset_tag || "N/A", 25, 20, { align: "center" });
      
      doc.setLineWidth(0.2);
      doc.rect(1, 1, 48, 23); // Border
    });

    const fileName = assetsToPrint.length === 1 ? `Label_${assetsToPrint[0].asset_tag}.pdf` : `Bulk_Labels_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    doc.save(fileName);
  };

  const handleUpdateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAsset || !user) return;
    try {
      await updateDoc(doc(db, 'assets', editingAsset.id), {
        ...editingAsset,
        userId: user.uid
      });
      await logActivity('UPDATE', 'Asset', `Updated asset: ${editingAsset.asset_name}`);
      setEditingAsset(null);
    } catch (error) {
      console.error("Update asset error:", error);
    }
  };

  const handleSaveLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      if (editingLicense) {
        await updateDoc(doc(db, 'licenses', editingLicense.id), {
          ...editingLicense,
          userId: user.uid
        });
        await logActivity('UPDATE', 'License', `Updated license: ${editingLicense.software_name}`);
      } else {
        await addDoc(collection(db, 'licenses'), {
          ...newLicense,
          userId: user.uid,
          createdAt: new Date().toISOString()
        });
        await logActivity('ADD', 'License', `Added license: ${newLicense.software_name}`);
      }

      setShowLicenseModal(false);
      setEditingLicense(null);
      setNewLicense({
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), 'yyyy-MM-dd'),
        status: 'Active',
        currency: 'Kyats'
      });
    } catch (error) {
      console.error("Save license error:", error);
    }
  };

  const handleRenewLicense = async (license: License) => {
    if (!user) return;
    const newEndDate = format(new Date(parseISO(license.end_date).setFullYear(parseISO(license.end_date).getFullYear() + 1)), 'yyyy-MM-dd');
    try {
      await updateDoc(doc(db, 'licenses', license.id), {
        end_date: newEndDate,
        status: 'Active',
        userId: user.uid
      });
      await logActivity('UPDATE', 'License', `Renewed license: ${license.software_name}`);
    } catch (error) {
      console.error("Renew license error:", error);
    }
  };

  const handleDeleteLicense = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'licenses', id));
      await logActivity('DELETE', 'License', `Deleted license ID: ${id}`);
    } catch (error) {
      console.error("Delete license error:", error);
    }
  };

  const fetchAssetHistory = async (asset: Asset) => {
    if (!user) return;
    setHistoryAsset(asset);
    setLoadingHistory(true);
    try {
      const q = query(collection(db, 'asset_history'), where('asset_id', '==', asset.id), where('userId', '==', user.uid), orderBy('change_date', 'desc'));
      const snapshot = await getDocs(q);
      setAssetHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssetHistory)));
    } catch (error) {
      console.error("Fetch history error:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleBulkDeleteAssets = async () => {
    if (selectedAssetIds.length === 0 || !user) return;
    try {
      const batch = writeBatch(db);
      selectedAssetIds.forEach(id => {
        batch.delete(doc(db, 'assets', id));
      });
      await batch.commit();
      await logActivity('DELETE', 'Asset', `Bulk deleted ${selectedAssetIds.length} assets`);
      setSelectedAssetIds([]);
    } catch (error) {
      console.error("Bulk delete error:", error);
    }
  };

  const toggleAssetSelection = (id: string) => {
    setSelectedAssetIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteExpenses = async () => {
    if (selectedExpenseIds.length === 0 || !user) return;
    try {
      const batch = writeBatch(db);
      selectedExpenseIds.forEach(id => {
        batch.delete(doc(db, 'expenses', id));
      });
      await batch.commit();
      await logActivity('DELETE', 'Expense', `Bulk deleted ${selectedExpenseIds.length} expenses`);
      setSelectedExpenseIds([]);
    } catch (error) {
      console.error("Bulk delete error:", error);
    }
  };

  const toggleExpenseSelection = (id: string) => {
    setSelectedExpenseIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleAssetActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetAction || !user) return;

    const { type, assets: targetAssets } = assetAction;
    let updateData: any = {};

    switch (type) {
      case 'Check out':
        updateData.assigned_to = actionData.assigned_to;
        updateData.status = 'Active';
        break;
      case 'Check in':
        updateData.assigned_to = '';
        updateData.status = 'In Stock';
        break;
      case 'Lease':
        updateData.assigned_to = actionData.assigned_to;
        updateData.status = 'Leased';
        break;
      case 'Lease Return':
        updateData.assigned_to = '';
        updateData.status = 'In Stock';
        break;
      case 'Dispose':
        updateData.status = 'Retired';
        break;
      case 'Maintenance':
        updateData.status = 'Maintenance';
        break;
      case 'Move':
        updateData.location = actionData.location;
        updateData.department = actionData.department;
        break;
      case 'Reserve':
        updateData.assigned_to = actionData.assigned_to;
        updateData.status = 'Reserved';
        break;
    }

    try {
      const batch = writeBatch(db);
      targetAssets.forEach(asset => {
        batch.update(doc(db, 'assets', asset.id), {
          ...updateData,
          userId: user.uid
        });
        const historyRef = doc(collection(db, 'asset_history'));
        batch.set(historyRef, {
          asset_id: asset.id,
          change_date: new Date().toISOString(),
          status: updateData.status || asset.status,
          assigned_to: updateData.assigned_to !== undefined ? updateData.assigned_to : asset.assigned_to,
          notes: `${type}: ${actionData.notes}`,
          userId: user.uid
        });
      });
      await batch.commit();
      await logActivity('UPDATE', 'Asset', `Performed ${type} on ${targetAssets.length} assets`);
      setShowActionModal(false);
      setAssetAction(null);
      setActionData({ notes: '', assigned_to: '', location: '', department: '' });
      setSelectedAssetIds([]);
    } catch (error) {
      console.error("Action submit error:", error);
    }
  };

  const exportToExcel = () => {
    const ws = xlsx.utils.json_to_sheet(expenses);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Expenses");
    xlsx.writeFile(wb, `IT_Expenses_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text("IT Expense Report", 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Date', 'Vendor', 'Description', 'Category', 'Amount', 'Type']],
      body: filteredExpenses.map(e => [e.payment_date, e.vendor, e.description, e.category, e.amount, e.type]),
    });
    doc.save(`IT_Expenses_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const downloadTemplate = () => {
    const headers = ['payment_date', 'vendor', 'description', 'category', 'amount', 'currency', 'payment_method', 'invoice_number', 'type'];
    const sampleData = [
      ['2024-03-10', 'Apple Inc', 'MacBook Pro 14"', 'Hardware', '2499', 'USD', 'Transfer', 'INV-001', 'Asset'],
      ['2024-03-11', 'Amazon Web Services', 'Monthly Cloud Hosting', 'Software', '150', 'USD', 'Credit Card', 'AWS-992', 'Expense']
    ];
    
    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'it_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const backupData = async () => {
    if (!user) return;
    try {
      const collectionsToBackup = ['expenses', 'assets', 'licenses', 'asset_history', 'system_activities'];
      const data: any = {
        version: '1.0',
        exportedAt: new Date().toISOString()
      };

      for (const col of collectionsToBackup) {
        const q = query(collection(db, col), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        data[col] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `it_inventory_backup_${format(new Date(), 'yyyy-MM-dd')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Backup error:', error);
      alert('Failed to backup data');
    }
  };

  const handleRestoreData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const batch = writeBatch(db);

        // Delete existing data for user
        const collections = ['expenses', 'assets', 'licenses', 'asset_history', 'system_activities'];
        for (const col of collections) {
          const q = query(collection(db, col), where('userId', '==', user.uid));
          const snapshot = await getDocs(q);
          snapshot.docs.forEach(doc => batch.delete(doc.ref));
        }

        // Add new data
        const collectionsToAdd = ['expenses', 'assets', 'licenses', 'asset_history', 'system_activities'];
        for (const col of collectionsToAdd) {
          if (data[col]) {
            data[col].forEach((item: any) => {
              // Remove id from item if it exists so Firestore generates a new one, or keep it if we want to preserve IDs.
              // Let's keep the ID to preserve relationships.
              const { id, ...itemData } = item;
              const docRef = id ? doc(db, col, id) : doc(collection(db, col));
              batch.set(docRef, { ...itemData, userId: user.uid });
            });
          }
        }

        await batch.commit();
        await logActivity('RESTORE', 'System', 'Restored data from JSON backup');
      } catch (error: any) {
        console.error('Restore error:', error);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const compressImage = async (base64Str: string, maxWidth = 600, maxHeight = 600, quality = 0.5): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const generateAssetImage = async (asset: Asset) => {
    if (!user) return;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `A professional product photo of an IT asset: ${asset.asset_name}. Description: ${asset.vendor} ${asset.asset_name}. Clean studio lighting, white background.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      let base64Image = '';
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (base64Image) {
        const compressedImage = await compressImage(base64Image);
        await updateDoc(doc(db, 'assets', asset.id), {
          image_url: compressedImage,
          userId: user.uid
        });
      }
    } catch (error) {
      console.error("Generate image error:", error);
      alert("Failed to generate image. Please try again.");
    }
  };

  const generateExpenseImage = async (expense: Expense) => {
    if (!user) return;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `A professional product photo of an IT item: ${expense.description}. Vendor: ${expense.vendor}. Clean studio lighting, white background.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      let base64Image = '';
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (base64Image) {
        const compressedImage = await compressImage(base64Image);
        await updateDoc(doc(db, 'expenses', expense.id), {
          image_url: compressedImage,
          userId: user.uid
        });
      }
    } catch (error) {
      console.error("Generate expense image error:", error);
      alert("Failed to generate image. Please try again.");
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'expenses', id));
      await logActivity('DELETE', 'Expense', `Deleted expense ID: ${id}`);
    } catch (error) {
      console.error("Delete expense error:", error);
      alert("Failed to delete expense due to a network error.");
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'assets', id));
      await logActivity('DELETE', 'Asset', `Deleted asset ID: ${id}`);
    } catch (error) {
      console.error("Delete asset error:", error);
    }
  };

  const COLORS = ['#0f172a', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading && !expenses.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-slate-900" size={48} />
          <p className="text-slate-600 font-medium">Loading your IT ecosystem...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 z-50 hidden lg:block">
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
            <Package size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">IT Expense</h1>
            <p className="text-xs text-slate-500">Management System</p>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={LayoutDashboard} 
            label="Dashboard" 
          />
          <NavItem 
            active={activeTab === 'expenses'} 
            onClick={() => setActiveTab('expenses')} 
            icon={Receipt} 
            label="Expenses" 
          />
          <NavItem 
            active={activeTab === 'assets'} 
            onClick={() => setActiveTab('assets')} 
            icon={HardDrive} 
            label="Asset Register" 
          />
          <NavItem 
            active={activeTab === 'licenses'} 
            onClick={() => setActiveTab('licenses')} 
            icon={Key} 
            label="Licenses" 
          />
          <NavItem 
            active={activeTab === 'analytics'} 
            onClick={() => setActiveTab('analytics')} 
            icon={BarChart3} 
            label="Analytics" 
          />
          <NavItem 
            active={activeTab === 'activities'} 
            onClick={() => setActiveTab('activities')} 
            icon={History} 
            label="Activity Log" 
          />
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t border-slate-100 space-y-4">
          <div className="bg-slate-50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Upload Data</p>
              <button onClick={downloadTemplate} className="text-[10px] text-blue-600 hover:underline font-medium">Template</button>
            </div>
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-white hover:border-slate-400 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploading ? (
                  <Loader2 className="animate-spin text-slate-400" size={24} />
                ) : (
                  <>
                    <Upload className="text-slate-400 mb-1" size={20} />
                    <p className="text-[10px] text-slate-500 text-center px-2">Drop PDF/XLSX or click to browse</p>
                  </>
                )}
              </div>
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.xlsx,.xls,.csv" disabled={uploading} />
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2">Data (JSON)</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" className="text-[10px] h-8 px-2" onClick={backupData} icon={Download}>Backup</Button>
              <label className="flex items-center justify-center gap-1 h-8 px-2 rounded-lg border border-slate-200 text-[10px] font-medium hover:bg-slate-50 cursor-pointer">
                <History size={12} />
                Restore
                <input type="file" className="hidden" onChange={handleRestoreData} accept=".json" />
              </label>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen p-4 lg:p-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h2>
            <p className="text-slate-500">Welcome back, IT Admin</p>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === 'assets' && selectedAssetIds.length > 0 && (
              <Button 
                variant="danger" 
                icon={Trash2} 
                onClick={handleBulkDeleteAssets}
              >
                Delete ({selectedAssetIds.length})
              </Button>
            )}
            {activeTab === 'expenses' && selectedExpenseIds.length > 0 && (
              <Button 
                variant="danger" 
                icon={Trash2} 
                onClick={handleBulkDeleteExpenses}
              >
                Delete ({selectedExpenseIds.length})
              </Button>
            )}
            {(activeTab === 'assets' || activeTab === 'expenses' || activeTab === 'licenses') && (
              <Button 
                variant="outline" 
                icon={uploading ? Loader2 : Upload} 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Processing...' : 'Bulk Import'}
              </Button>
            )}
            <Button variant="outline" icon={Download} onClick={exportToExcel}>Export</Button>
            {activeTab === 'licenses' ? (
              <Button icon={Plus} onClick={() => {
                setEditingLicense(null);
                setShowLicenseModal(true);
              }}>Add License</Button>
            ) : activeTab === 'assets' ? (
              <Button icon={Plus} onClick={() => {
                setEditingAsset(null);
                setShowAssetModal(true);
              }}>Add Asset</Button>
            ) : (
              <Button icon={Plus} onClick={() => {
                setEditingExpense(null);
                setEditingAsset(null);
                setShowExpenseModal(true);
              }}>Add Record</Button>
            )}
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileUpload} 
            accept=".pdf,.xlsx,.xls" 
            disabled={uploading} 
          />
        </header>

        {uploadSuccess && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <CheckCircle2 size={20} />
            <span className="font-medium">{uploadSuccess}</span>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Dashboard Filters */}
            <Card className="p-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Period:</span>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  className="bg-slate-50 border-none text-sm font-medium rounded-lg focus:ring-0 px-3 py-1.5"
                  value={dashboardFilters.startDate}
                  onChange={(e) => setDashboardFilters(prev => ({ ...prev, startDate: e.target.value }))}
                />
                <span className="text-slate-400">to</span>
                <input 
                  type="date" 
                  className="bg-slate-50 border-none text-sm font-medium rounded-lg focus:ring-0 px-3 py-1.5"
                  value={dashboardFilters.endDate}
                  onChange={(e) => setDashboardFilters(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <div className="h-6 w-px bg-slate-200 mx-2 hidden md:block" />
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Category:</span>
                <select 
                  className="bg-slate-50 border-none text-sm font-medium rounded-lg focus:ring-0 px-3 py-1.5"
                  value={dashboardFilters.category}
                  onChange={(e) => setDashboardFilters(prev => ({ ...prev, category: e.target.value }))}
                >
                  <option value="All">All Categories</option>
                  <option value="Laptop">Laptop</option>
                  <option value="Hardware">Hardware</option>
                  <option value="Software">Software</option>
                  <option value="Internet">Internet</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Office Supplies">Office Supplies</option>
                  <option value="Printer and Toner consumable">Printer and Toner consumable</option>
                  <option value="Printer service">Printer service</option>
                </select>
              </div>
              <Button 
                variant="ghost" 
                className="ml-auto text-xs py-1"
                onClick={() => setDashboardFilters({ startDate: '', endDate: '', category: 'All' })}
              >
                Reset Filters
              </Button>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard 
                label="Total Spending" 
                value={`${(stats?.summary?.totalSpending || 0).toLocaleString()} Kyats`} 
                trend="+12.5%" 
                icon={DollarSign} 
                color="bg-blue-500"
              />
              <StatCard 
                label="Operational Expenses" 
                value={`${(stats?.summary?.totalOpEx || 0).toLocaleString()} Kyats`} 
                trend="-2.4%" 
                icon={Receipt} 
                color="bg-emerald-500"
              />
              <StatCard 
                label="Fixed Assets Value" 
                value={`${(stats?.summary?.totalCapEx || 0).toLocaleString()} Kyats`} 
                trend="+5.1%" 
                icon={HardDrive} 
                color="bg-amber-500"
              />
              <StatCard 
                label={dashboardFilters.category !== 'All' ? `Total ${dashboardFilters.category}` : "Active Assets"} 
                value={(stats?.summary?.activeAssetsCount || 0).toString()} 
                trend="+3" 
                icon={Package} 
                color="bg-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Chart */}
              <Card className="lg:col-span-2 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg">Monthly IT Spending</h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.monthlySpending || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        tickFormatter={(value) => `${value}`}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`${value.toLocaleString()}`, 'Total Spending']}
                      />
                      <Bar dataKey="total" fill="#0f172a" radius={[6, 6, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Category Breakdown */}
              <Card className="p-6">
                <h3 className="font-bold text-lg mb-6">Category Breakdown</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats?.categorySpending || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="total"
                        nameKey="category"
                      >
                        {(stats?.categorySpending || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`${value.toLocaleString()}`, 'Total']}
                      />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-lg">Recent Transactions</h3>
                <Button variant="ghost" className="text-sm" onClick={() => setActiveTab('expenses')}>View All</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Image</th>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Vendor</th>
                      <th className="px-6 py-4 font-semibold">User</th>
                      <th className="px-6 py-4 font-semibold">Amount</th>
                      <th className="px-6 py-4 font-semibold">USD</th>
                      <th className="px-6 py-4 font-semibold">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.slice(0, 5).map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="w-8 h-8 bg-slate-100 rounded flex items-center justify-center text-slate-400 overflow-hidden">
                            {exp.image_url ? (
                              <img src={exp.image_url} alt={exp.vendor} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <ImageIcon size={16} />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">{formatDate(exp.payment_date)}</td>
                        <td className="px-6 py-4 text-sm">{exp.vendor}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{exp.user || '-'}</td>
                        <td className="px-6 py-4 text-sm font-bold">{exp.currency} {exp.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-500">
                          {exp.currency === 'USD' ? `$${exp.amount.toLocaleString()}` : `$${(exp.amount / EXCHANGE_RATE).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={exp.type === 'Asset' ? 'info' : 'default'}>{exp.type}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="space-y-6">
            <Card className="p-4 flex flex-col md:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search vendor, description or category..." 
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Filter size={18} className="text-slate-400" />
                <select 
                  className="bg-slate-50 border-none text-sm font-medium rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                >
                  <option value="All">All Types</option>
                  <option value="Asset">Assets</option>
                  <option value="Expense">Expenses</option>
                </select>
                <Button variant="outline" icon={Download} onClick={exportToPDF}>PDF Report</Button>
              </div>
            </Card>

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-semibold w-12">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                          checked={filteredExpenses.length > 0 && selectedExpenseIds.length === filteredExpenses.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedExpenseIds(filteredExpenses.map(exp => exp.id));
                            } else {
                              setSelectedExpenseIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-6 py-4 font-semibold">Image</th>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Vendor</th>
                      <th className="px-6 py-4 font-semibold">Description</th>
                      <th className="px-6 py-4 font-semibold">Category</th>
                      <th className="px-6 py-4 font-semibold">User</th>
                      <th className="px-6 py-4 font-semibold">Amount</th>
                      <th className="px-6 py-4 font-semibold">USD</th>
                      <th className="px-6 py-4 font-semibold">Method</th>
                      <th className="px-6 py-4 font-semibold">Type</th>
                      <th className="px-6 py-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExpenses.map((exp) => (
                      <tr key={exp.id} className={`hover:bg-slate-50 transition-colors ${selectedExpenseIds.includes(exp.id) ? 'bg-slate-50' : ''}`}>
                        <td className="px-6 py-4">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                            checked={selectedExpenseIds.includes(exp.id)}
                            onChange={() => toggleExpenseSelection(exp.id)}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 overflow-hidden">
                            {exp.image_url ? (
                              <img src={exp.image_url} alt={exp.vendor} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <ImageIcon size={20} />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium whitespace-nowrap">{formatDate(exp.payment_date)}</td>
                        <td className="px-6 py-4 text-sm font-semibold">{exp.vendor}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">{exp.description}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{exp.category}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{exp.user || '-'}</td>
                        <td className="px-6 py-4 text-sm font-bold">{exp.currency} {exp.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-500">
                          {exp.currency === 'USD' ? `$${exp.amount.toLocaleString()}` : `$${(exp.amount / EXCHANGE_RATE).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{exp.payment_method}</td>
                        <td className="px-6 py-4">
                          <Badge variant={exp.type === 'Asset' ? 'info' : 'default'}>{exp.type}</Badge>
                        </td>
                        <td className="px-6 py-4 flex items-center gap-1">
                          <button 
                            onClick={() => {
                              setEditingExpense(exp);
                              setNewExpense(exp);
                              setShowExpenseModal(true);
                            }}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-900"
                            title="Edit Record"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => generateExpenseImage(exp)}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-900"
                            title="Generate Image"
                          >
                            <ImageIcon size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors text-slate-400 hover:text-red-600"
                            title="Delete Record"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'activities' && (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <History className="text-slate-900" size={24} />
                  System Activity Log
                </h3>
                <div className="text-sm text-slate-500">
                  Showing last 100 activities
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Time</th>
                      <th className="px-6 py-4 font-semibold">Action</th>
                      <th className="px-6 py-4 font-semibold">Entity</th>
                      <th className="px-6 py-4 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activities.map((activity) => (
                      <tr key={activity.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium whitespace-nowrap">
                          {format(parseISO(activity.timestamp), 'MMM dd, HH:mm:ss')}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={
                            activity.action_type === 'ADD' ? 'success' :
                            activity.action_type === 'DELETE' ? 'danger' :
                            activity.action_type === 'UPDATE' ? 'info' :
                            activity.action_type === 'RESTORE' ? 'warning' :
                            'default'
                          }>
                            {activity.action_type}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold">{activity.entity_type}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{activity.description}</td>
                      </tr>
                    ))}
                    {activities.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                          No activities logged yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="space-y-6">
            <Card className="p-4 flex flex-col md:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search asset name, vendor, serial or user..." 
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Button variant="outline" icon={Download} onClick={() => {
                  const doc = new jsPDF();
                  doc.text("Asset Register Report", 14, 15);
                  autoTable(doc, {
                    startY: 20,
                    head: [['Asset Tag', 'Asset Name', 'Vendor', 'Status', 'Cost', 'Assigned To']],
                    body: filteredAssets.map(a => [a.asset_tag || 'N/A', a.asset_name, a.vendor, a.status, a.cost, a.assigned_to]),
                  });
                  doc.save(`Asset_Register_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
                }}>PDF Report</Button>
              </div>
            </Card>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  checked={filteredAssets.length > 0 && selectedAssetIds.length === filteredAssets.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedAssetIds(filteredAssets.map(a => a.id));
                    } else {
                      setSelectedAssetIds([]);
                    }
                  }}
                />
                <span className="text-sm font-medium text-slate-600">
                  {selectedAssetIds.length > 0 ? `${selectedAssetIds.length} selected` : 'Select All Assets'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedAssetIds.length > 0 ? (
                  <>
                    <span className="text-xs font-bold text-slate-400 uppercase mr-2">Bulk Actions:</span>
                    <button
                      onClick={() => {
                        const selectedAssets = assets.filter(a => selectedAssetIds.includes(a.id));
                        printAssetLabels(selectedAssets);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap bg-blue-600 text-white shadow-md hover:bg-blue-700 flex items-center gap-2"
                    >
                      <Printer size={14} />
                      Print Labels
                    </button>
                    {[
                      { label: 'Check out', type: 'Check out' },
                      { label: 'Check in', type: 'Check in' },
                      { label: 'Lease', type: 'Lease' },
                      { label: 'Lease Return', type: 'Lease Return' },
                      { label: 'Move', type: 'Move' },
                      { label: 'Reserve', type: 'Reserve' },
                      { label: 'Maintenance', type: 'Maintenance' },
                      { label: 'Dispose', type: 'Dispose', variant: 'danger' },
                    ].map((action) => (
                      <button
                        key={action.label}
                        onClick={() => {
                          const selectedAssets = assets.filter(a => selectedAssetIds.includes(a.id));
                          if (selectedAssets.length > 0) {
                            setAssetAction({ type: action.type as any, assets: selectedAssets });
                            setShowActionModal(true);
                          }
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                          action.variant === 'danger' 
                            ? "bg-red-50 text-red-600 hover:bg-red-100" 
                            : "bg-slate-900 text-white shadow-md hover:bg-slate-800"
                        )}
                      >
                        {action.label}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <span className="text-xs font-bold text-slate-400 uppercase mr-2">Filter Status:</span>
                    {[
                      { label: 'All', status: 'All' },
                      { label: 'Check out', status: 'Active' },
                      { label: 'Check in', status: 'In Stock' },
                      { label: 'Lease', status: 'Leased' },
                      { label: 'Dispose', status: 'Retired' },
                      { label: 'Maintenance', status: 'Maintenance' },
                      { label: 'Reserve', status: 'Reserved' },
                    ].map((filter) => (
                      <button
                        key={filter.label}
                        onClick={() => setAssetStatusFilter(filter.status)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                          assetStatusFilter === filter.status 
                            ? "bg-slate-900 text-white shadow-md" 
                            : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAssets.map((asset) => (
                <Card 
                  key={asset.id} 
                  className={cn(
                    "p-6 flex flex-col h-full relative transition-all",
                    selectedAssetIds.includes(asset.id) ? "ring-2 ring-slate-900 border-transparent" : ""
                  )}
                >
                  <div className="absolute top-4 right-4 z-10">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      checked={selectedAssetIds.includes(asset.id)}
                      onChange={() => toggleAssetSelection(asset.id)}
                    />
                  </div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-900 overflow-hidden">
                      {asset.image_url ? (
                        <img src={asset.image_url} alt={asset.asset_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <HardDrive size={24} />
                      )}
                    </div>
                    <div className="mr-8 flex items-center gap-2">
                      <Badge variant={
                        asset.status === 'Active' ? 'success' : 
                        asset.status === 'In Stock' ? 'info' : 
                        asset.status === 'Maintenance' ? 'warning' : 
                        asset.status === 'Leased' ? 'purple' :
                        asset.status === 'Reserved' ? 'indigo' :
                        asset.status === 'Retired' ? 'danger' :
                        'default'
                      }>
                        {asset.status}
                      </Badge>
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === asset.id ? null : asset.id);
                          }}
                          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <MoreVertical size={18} className="text-slate-400" />
                        </button>
                        {openMenuId === asset.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-[60] py-2 overflow-hidden">
                            <ActionMenuItem icon={UserPlus} label="Check out" onClick={() => { setAssetAction({ type: 'Check out', assets: [asset] }); setShowActionModal(true); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={UserMinus} label="Check in" onClick={() => { setAssetAction({ type: 'Check in', assets: [asset] }); setShowActionModal(true); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={FileSignature} label="Lease" onClick={() => { setAssetAction({ type: 'Lease', assets: [asset] }); setShowActionModal(true); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={RotateCcw} label="Lease Return" onClick={() => { setAssetAction({ type: 'Lease Return', assets: [asset] }); setShowActionModal(true); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={Wrench} label="Maintenance" onClick={() => { setAssetAction({ type: 'Maintenance', assets: [asset] }); setShowActionModal(true); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={MapPin} label="Move" onClick={() => { setAssetAction({ type: 'Move', assets: [asset] }); setShowActionModal(true); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={Bookmark} label="Reserve" onClick={() => { setAssetAction({ type: 'Reserve', assets: [asset] }); setShowActionModal(true); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={ImageIcon} label="Generate Image" onClick={() => { generateAssetImage(asset); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={Printer} label="Print Label" onClick={() => { printAssetLabels([asset]); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={Edit2} label="Edit Asset" onClick={() => { 
                              setEditingAsset(asset); 
                              setOpenMenuId(null); 
                            }} />
                            <div className="border-t border-slate-100 my-1"></div>
                            <ActionMenuItem icon={Ban} label="Dispose" variant="danger" onClick={() => { setAssetAction({ type: 'Dispose', assets: [asset] }); setShowActionModal(true); setOpenMenuId(null); }} />
                            <ActionMenuItem icon={Trash2} label="Delete" variant="danger" onClick={() => { handleDeleteAsset(asset.id); setOpenMenuId(null); }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-lg">{asset.asset_name}</h4>
                  <span className="text-[11px] font-mono bg-slate-900 px-2 py-1 rounded text-white font-bold shadow-sm">
                    {asset.asset_tag}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-sm text-slate-500">{asset.vendor}</p>
                  {asset.category && (
                    <span className="text-[10px] font-medium bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                      {asset.category}
                    </span>
                  )}
                </div>
                
                <div className="space-y-3 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Purchase Date</span>
                    <span className="font-medium">{formatDate(asset.purchase_date)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Cost</span>
                    <span className="font-bold text-slate-900">${asset.cost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Serial Number</span>
                    <span className="font-mono text-xs">{asset.serial_number || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Assigned To</span>
                    <span className="font-medium">{asset.assigned_to || 'Unassigned'}</span>
                  </div>
                  {asset.user && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Primary User</span>
                      <span className="font-medium">{asset.user}</span>
                    </div>
                  )}
                  {asset.department && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Department</span>
                      <span className="font-medium">{asset.department}</span>
                    </div>
                  )}
                  {asset.location && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Location</span>
                      <span className="font-medium">{asset.location}</span>
                    </div>
                  )}
                  {asset.warranty_expiry && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Warranty Expiry</span>
                      <span className="font-medium text-amber-600">{formatDate(asset.warranty_expiry)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 flex gap-2">
                  <Button variant="outline" className="flex-1 text-xs py-1.5" onClick={() => setEditingAsset(asset)}>Edit Details</Button>
                  <Button variant="ghost" className="flex-1 text-xs py-1.5" onClick={() => fetchAssetHistory(asset)}>History</Button>
                </div>
              </Card>
            ))}
            <button 
              onClick={() => setShowAssetModal(true)}
              className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-all group"
            >
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-slate-100 transition-all">
                <Plus size={24} />
              </div>
              <span className="font-bold">Add New Asset</span>
            </button>
          </div>
        </div>
      )}

        {activeTab === 'licenses' && (
          <div className="space-y-6">
            <Card className="p-4 flex flex-col md:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search software, vendor or user..." 
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {licenses.filter(l => 
                l.software_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (l.assigned_to && l.assigned_to.toLowerCase().includes(searchTerm.toLowerCase()))
              ).map((license) => {
                const isExpired = new Date(license.end_date) < new Date();
                const isExpiringSoon = !isExpired && new Date(license.end_date) < new Date(new Date().setDate(new Date().getDate() + 30));
                
                return (
                  <Card key={license.id} className="p-6 flex flex-col h-full relative transition-all">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-900">
                        <Key size={24} />
                      </div>
                      <div>
                        <Badge variant={isExpired ? 'warning' : isExpiringSoon ? 'warning' : 'success'}>
                          {isExpired ? 'Expired' : isExpiringSoon ? 'Expiring Soon' : 'Active'}
                        </Badge>
                      </div>
                    </div>
                    <h4 className="font-bold text-lg mb-1">{license.software_name}</h4>
                    <p className="text-sm text-slate-500 mb-4">{license.vendor}</p>
                    
                    <div className="space-y-3 flex-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">License Key</span>
                        <span className="font-mono text-xs truncate max-w-[120px]">{license.license_key || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Start Date</span>
                        <span className="font-medium">{formatDate(license.start_date)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">End Date</span>
                        <span className={cn("font-bold", isExpired ? "text-red-500" : isExpiringSoon ? "text-amber-500" : "text-slate-900")}>
                          {formatDate(license.end_date)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Assigned To</span>
                        <span className="font-medium">{license.assigned_to || 'Unassigned'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Cost</span>
                        <span className="font-bold text-slate-900">{license.currency} {license.cost.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-100 flex gap-2">
                      <Button variant="secondary" className="flex-1 text-xs py-1.5" onClick={() => handleRenewLicense(license)}>Renew</Button>
                      <Button variant="outline" className="flex-1 text-xs py-1.5" onClick={() => {
                        setEditingLicense(license);
                        setShowLicenseModal(true);
                      }}>Edit</Button>
                      <Button variant="ghost" className="text-red-500 hover:bg-red-50 p-2" onClick={() => handleDeleteLicense(license.id)}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </Card>
                );
              })}
              <button 
                onClick={() => {
                  setEditingLicense(null);
                  setShowLicenseModal(true);
                }}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-all group"
              >
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-slate-100 transition-all">
                  <Plus size={24} />
                </div>
                <span className="font-bold">Add New License</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="p-6">
                <h3 className="font-bold text-lg mb-6">Spending Trend</h3>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats?.monthlySpending || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `${v}`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(v: number) => [`${v.toLocaleString()}`, 'Spending']}
                      />
                      <Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={3} dot={{ fill: '#0f172a', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-bold text-lg mb-6">Top Vendors</h3>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.vendorSpending || []} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `${v}`} />
                      <YAxis dataKey="vendor" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={100} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(v: number) => [`${v.toLocaleString()}`, 'Total Spending']}
                      />
                      <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="p-6">
                <h3 className="font-bold text-lg mb-6">Asset Allocation by Department</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats?.assetAllocationByDepartment || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="department"
                      >
                        {(stats?.assetAllocationByDepartment || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(v: number) => [`${v}`, 'Assets']}
                      />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-bold text-lg mb-6">Asset Allocation by Location</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.assetAllocationByLocation || []} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis dataKey="location" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={100} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(v: number) => [`${v}`, 'Assets']}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Card className="p-6">
                <h3 className="font-bold text-lg mb-6">Asset vs Expense</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats?.typeSpending || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="total"
                        nameKey="type"
                      >
                        {(stats?.typeSpending || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#0f172a' : '#10b981'} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(v: number) => [`${v.toLocaleString()}`, 'Total']}
                      />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="lg:col-span-2 p-6">
                <h3 className="font-bold text-lg mb-6">Budget Utilization</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                  <div className="space-y-6">
                    <BudgetProgress label="Laptop" current={85000} budget={100000} color="bg-indigo-500" currency="Kyats" />
                    <BudgetProgress label="Hardware" current={45000} budget={60000} color="bg-blue-500" currency="Kyats" />
                    <BudgetProgress label="Software" current={12000} budget={15000} color="bg-emerald-500" currency="Kyats" />
                  </div>
                  <div className="space-y-6">
                    <BudgetProgress label="Printer Consumables" current={5000} budget={8000} color="bg-pink-500" currency="Kyats" />
                    <BudgetProgress label="Printer Service" current={2000} budget={5000} color="bg-purple-500" currency="Kyats" />
                    <BudgetProgress label="Maintenance" current={3200} budget={5000} color="bg-amber-500" currency="Kyats" />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{editingExpense ? 'Edit Record' : 'Add New Record'}</h3>
              <button onClick={() => {
                setShowExpenseModal(false);
                setEditingExpense(null);
                setNewExpense({
                  payment_date: format(new Date(), 'yyyy-MM-dd'),
                  type: 'Expense',
                  currency: 'Kyats',
                  user: '',
                  image_url: ''
                });
              }} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Date</label>
                  <input 
                    type="date" 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newExpense.payment_date}
                    onChange={e => setNewExpense({...newExpense, payment_date: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Type</label>
                  <select 
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newExpense.type}
                    onChange={e => setNewExpense({...newExpense, type: e.target.value as any})}
                  >
                    <option value="Expense">Expense</option>
                    <option value="Asset">Asset</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Vendor</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Amazon, Microsoft, etc."
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={newExpense.vendor}
                  onChange={e => setNewExpense({...newExpense, vendor: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Description</label>
                <textarea 
                  required
                  placeholder="What was this for?"
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900 h-20"
                  value={newExpense.description}
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Category</label>
                  <select 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newExpense.category}
                    onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                  >
                    <option value="">Select Category</option>
                    <option value="Laptop">Laptop</option>
                    <option value="Hardware">Hardware</option>
                    <option value="Software">Software</option>
                    <option value="Internet">Internet</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Printer and Toner consumable">Printer and Toner consumable</option>
                    <option value="Printer service">Printer service</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Amount</label>
                  <input 
                    type="number" 
                    required
                    placeholder="0.00"
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newExpense.amount}
                    onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value)})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">User</label>
                <input 
                  type="text" 
                  placeholder="Who is this for?"
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={newExpense.user || ''}
                  onChange={e => setNewExpense({...newExpense, user: e.target.value})}
                />
              </div>
              <div className="pt-4">
                <Button type="submit" className="w-full py-3">Save Record</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Asset Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Add New Asset</h3>
              <button onClick={() => {
                setShowAssetModal(false);
                setNewAsset({
                  purchase_date: format(new Date(), 'yyyy-MM-dd'),
                  status: 'Active',
                  warranty_expiry: '',
                  department: '',
                  location: '',
                  user: '',
                  image_url: '',
                  category: 'Hardware'
                });
              }} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddAsset} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Fixed Asset No.</span>
                <input 
                  type="text"
                  className="font-mono font-bold text-slate-900 bg-white px-3 py-1.5 rounded shadow-sm border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:outline-none w-48 text-right"
                  value={newAsset.asset_tag || ''}
                  onChange={e => setNewAsset({...newAsset, asset_tag: e.target.value})}
                  placeholder="Auto-generated"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Category</label>
                  <select 
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newAsset.category || 'Hardware'}
                    onChange={e => setNewAsset({...newAsset, category: e.target.value})}
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Hardware">Hardware</option>
                    <option value="Software">Software</option>
                    <option value="Internet">Internet</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Printer and Toner consumable">Printer and Toner consumable</option>
                    <option value="Printer service">Printer service</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Purchase Date</label>
                  <input 
                    type="date" 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newAsset.purchase_date}
                    onChange={e => setNewAsset({...newAsset, purchase_date: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
                  <select 
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newAsset.status}
                    onChange={e => setNewAsset({...newAsset, status: e.target.value})}
                  >
                    <option value="Active">Active</option>
                    <option value="In Stock">In Stock</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Retired">Retired</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Asset Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. MacBook Pro M3"
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={newAsset.asset_name}
                  onChange={e => setNewAsset({...newAsset, asset_name: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Vendor</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Apple"
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={newAsset.vendor}
                  onChange={e => setNewAsset({...newAsset, vendor: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Primary User</label>
                <input 
                  type="text" 
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={newAsset.user || ''}
                  onChange={e => setNewAsset({...newAsset, user: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Cost</label>
                  <input 
                    type="number" 
                    required
                    placeholder="0.00"
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newAsset.cost}
                    onChange={e => setNewAsset({...newAsset, cost: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Serial Number</label>
                  <input 
                    type="text" 
                    placeholder="SN-123456"
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newAsset.serial_number}
                    onChange={e => setNewAsset({...newAsset, serial_number: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Assigned To</label>
                <input 
                  type="text" 
                  placeholder="Employee Name"
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={newAsset.assigned_to}
                  onChange={e => setNewAsset({...newAsset, assigned_to: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Department</label>
                  <input 
                    type="text" 
                    placeholder="e.g. IT, HR, Finance"
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newAsset.department}
                    onChange={e => setNewAsset({...newAsset, department: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Location</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Office A, Floor 2"
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={newAsset.location}
                    onChange={e => setNewAsset({...newAsset, location: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Warranty Expiry Date</label>
                <input 
                  type="date" 
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={newAsset.warranty_expiry}
                  onChange={e => setNewAsset({...newAsset, warranty_expiry: e.target.value})}
                />
              </div>
              <div className="pt-4">
                <Button type="submit" className="w-full py-3">Save Asset</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Edit Asset Modal */}
      {editingAsset && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Edit Asset Details</h3>
              <button onClick={() => setEditingAsset(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUpdateAsset} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Fixed Asset No.</span>
                <input 
                  type="text"
                  className="font-mono font-bold text-slate-900 bg-white px-3 py-1.5 rounded shadow-sm border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:outline-none w-48 text-right"
                  value={editingAsset.asset_tag || ''}
                  onChange={e => setEditingAsset({...editingAsset, asset_tag: e.target.value})}
                  placeholder="Auto-generated"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Category</label>
                  <select 
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingAsset.category || 'Hardware'}
                    onChange={e => setEditingAsset({...editingAsset, category: e.target.value})}
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Hardware">Hardware</option>
                    <option value="Software">Software</option>
                    <option value="Internet">Internet</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Printer and Toner consumable">Printer and Toner consumable</option>
                    <option value="Printer service">Printer service</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Purchase Date</label>
                  <input 
                    type="date" 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingAsset.purchase_date}
                    onChange={e => setEditingAsset({...editingAsset, purchase_date: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
                  <select 
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingAsset.status}
                    onChange={e => setEditingAsset({...editingAsset, status: e.target.value})}
                  >
                    <option value="Active">Active</option>
                    <option value="In Stock">In Stock</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Retired">Retired</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Asset Name</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={editingAsset.asset_name}
                  onChange={e => setEditingAsset({...editingAsset, asset_name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Cost</label>
                  <input 
                    type="number" 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingAsset.cost}
                    onChange={e => setEditingAsset({...editingAsset, cost: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Serial Number</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingAsset.serial_number || ''}
                    onChange={e => setEditingAsset({...editingAsset, serial_number: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Assigned To</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={editingAsset.assigned_to || ''}
                  onChange={e => setEditingAsset({...editingAsset, assigned_to: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Department</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingAsset.department || ''}
                    onChange={e => setEditingAsset({...editingAsset, department: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Location</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingAsset.location || ''}
                    onChange={e => setEditingAsset({...editingAsset, location: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Warranty Expiry Date</label>
                <input 
                  type="date" 
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={editingAsset.warranty_expiry || ''}
                  onChange={e => setEditingAsset({...editingAsset, warranty_expiry: e.target.value})}
                />
              </div>
              <div className="pt-4">
                <Button type="submit" className="w-full py-3">Update Asset</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* License Modal (Add/Edit) */}
      {(showLicenseModal || editingLicense) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{editingLicense ? 'Edit License' : 'Add New License'}</h3>
              <button onClick={() => {
                setShowLicenseModal(false);
                setEditingLicense(null);
              }} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveLicense} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Software Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Microsoft 365"
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={editingLicense ? editingLicense.software_name : newLicense.software_name}
                  onChange={e => editingLicense ? setEditingLicense({...editingLicense, software_name: e.target.value}) : setNewLicense({...newLicense, software_name: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Vendor</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Microsoft"
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                  value={editingLicense ? editingLicense.vendor : newLicense.vendor}
                  onChange={e => editingLicense ? setEditingLicense({...editingLicense, vendor: e.target.value}) : setNewLicense({...newLicense, vendor: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">License Key</label>
                <input 
                  type="text" 
                  placeholder="XXXXX-XXXXX-XXXXX"
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900 font-mono text-sm"
                  value={editingLicense ? editingLicense.license_key : newLicense.license_key}
                  onChange={e => editingLicense ? setEditingLicense({...editingLicense, license_key: e.target.value}) : setNewLicense({...newLicense, license_key: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Start Date</label>
                  <input 
                    type="date" 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingLicense ? editingLicense.start_date : newLicense.start_date}
                    onChange={e => editingLicense ? setEditingLicense({...editingLicense, start_date: e.target.value}) : setNewLicense({...newLicense, start_date: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">End Date</label>
                  <input 
                    type="date" 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingLicense ? editingLicense.end_date : newLicense.end_date}
                    onChange={e => editingLicense ? setEditingLicense({...editingLicense, end_date: e.target.value}) : setNewLicense({...newLicense, end_date: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Cost</label>
                  <input 
                    type="number" 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingLicense ? editingLicense.cost : newLicense.cost}
                    onChange={e => editingLicense ? setEditingLicense({...editingLicense, cost: parseFloat(e.target.value)}) : setNewLicense({...newLicense, cost: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Assigned To</label>
                  <input 
                    type="text" 
                    placeholder="User or Department"
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={editingLicense ? editingLicense.assigned_to : newLicense.assigned_to}
                    onChange={e => editingLicense ? setEditingLicense({...editingLicense, assigned_to: e.target.value}) : setNewLicense({...newLicense, assigned_to: e.target.value})}
                  />
                </div>
              </div>
              <div className="pt-4">
                <Button type="submit" className="w-full py-3">{editingLicense ? 'Update License' : 'Save License'}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {historyAsset && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold">Asset History</h3>
                <p className="text-sm text-slate-500">{historyAsset.asset_name} • {historyAsset.serial_number || 'No Serial'}</p>
              </div>
              <button onClick={() => setHistoryAsset(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Loader2 className="animate-spin mb-2" size={32} />
                  <p>Loading history...</p>
                </div>
              ) : assetHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <History size={48} className="mx-auto mb-3 opacity-20" />
                  <p>No history records found for this asset.</p>
                </div>
              ) : (
                <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                  {assetHistory.map((item) => (
                    <div key={item.id} className="relative">
                      <div className="absolute -left-8 top-1.5 w-6 h-6 rounded-full bg-white border-4 border-slate-100 flex items-center justify-center z-10">
                        <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            {formatDate(item.change_date, 'MMM dd, yyyy HH:mm')}
                          </span>
                          <Badge variant={item.status === 'Active' ? 'success' : item.status === 'Maintenance' ? 'warning' : 'default'}>
                            {item.status}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-slate-900 mb-1">{item.notes}</p>
                        {item.assigned_to && (
                          <p className="text-xs text-slate-500">
                            Assigned to: <span className="font-semibold text-slate-700">{item.assigned_to}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="mt-6 pt-6 border-t border-slate-100">
              <Button variant="outline" className="w-full" onClick={() => setHistoryAsset(null)}>Close</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Asset Action Modal */}
      {assetAction && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-900">
                  {assetAction.type === 'Check out' && <UserPlus size={20} />}
                  {assetAction.type === 'Check in' && <UserMinus size={20} />}
                  {assetAction.type === 'Lease' && <FileSignature size={20} />}
                  {assetAction.type === 'Lease Return' && <RotateCcw size={20} />}
                  {assetAction.type === 'Maintenance' && <Wrench size={20} />}
                  {assetAction.type === 'Move' && <MapPin size={20} />}
                  {assetAction.type === 'Reserve' && <Bookmark size={20} />}
                  {assetAction.type === 'Dispose' && <Ban size={20} />}
                </div>
                <h3 className="text-xl font-bold">{assetAction.type} Asset</h3>
              </div>
              <button onClick={() => setAssetAction(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleAssetActionSubmit} className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  {assetAction.assets.length > 1 ? 'Selected Assets' : 'Asset'}
                </p>
                {assetAction.assets.length > 1 ? (
                  <p className="font-bold text-slate-900">{assetAction.assets.length} assets selected</p>
                ) : (
                  <>
                    <p className="font-bold text-slate-900">{assetAction.assets[0].asset_name}</p>
                    <p className="text-xs text-slate-500">{assetAction.assets[0].serial_number || 'No Serial'}</p>
                  </>
                )}
              </div>

              {(assetAction.type === 'Check out' || assetAction.type === 'Lease' || assetAction.type === 'Reserve') && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">
                    {assetAction.type === 'Lease' ? 'Lessee Name' : 'Assign To'}
                  </label>
                  <input 
                    type="text" 
                    required
                    placeholder="Enter name..."
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                    value={actionData.assigned_to}
                    onChange={e => setActionData({...actionData, assigned_to: e.target.value})}
                  />
                </div>
              )}

              {assetAction.type === 'Move' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">New Location</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Floor 3"
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                      value={actionData.location}
                      onChange={e => setActionData({...actionData, location: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">New Department</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Sales"
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900"
                      value={actionData.department}
                      onChange={e => setActionData({...actionData, department: e.target.value})}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Action Notes</label>
                <textarea 
                  placeholder="Add any relevant details..."
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-slate-900 min-h-[100px]"
                  value={actionData.notes}
                  onChange={e => setActionData({...actionData, notes: e.target.value})}
                />
              </div>

              <div className="pt-4">
                <Button 
                  type="submit" 
                  className={cn("w-full py-3", assetAction.type === 'Dispose' ? "bg-red-500 hover:bg-red-600" : "")}
                >
                  Confirm {assetAction.type}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

function NavItem({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
        active 
          ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <Icon size={20} />
      {label}
    </button>
  );
}

function StatCard({ label, value, trend, icon: Icon, color }: { label: string; value: string; trend: string; icon: any; color: string }) {
  const isPositive = trend.startsWith('+');
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white", color)}>
          <Icon size={24} />
        </div>
        <div className={cn(
          "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg",
          isPositive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
        )}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend}
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
      <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
    </Card>
  );
}

function BudgetProgress({ label, current, budget, color, currency = 'Kyats' }: { label: string; current: number; budget: number; color: string; currency?: string }) {
  const percentage = Math.min(Math.round((current / budget) * 100), 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-medium">
        <span className="text-slate-700">{label}</span>
        <span className="text-slate-500">{currency} {current.toLocaleString()} / {currency} {budget.toLocaleString()}</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all duration-1000", color)} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-end">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{percentage}% Used</span>
      </div>
    </div>
  );
}
