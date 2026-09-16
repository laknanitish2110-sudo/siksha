import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      appName: 'Shiksha Academy',
      appSubtitle: 'Tuition Fee & Academy Administration',
      nav: {
        dashboard: 'Dashboard',
        students: 'Students',
        fees: 'Fee Setup',
        payments: 'Payments',
        reports: 'Reports',
        audit: 'Audit Logs',
        sync: 'Sync Center',
        logout: 'Logout'
      },
      status: {
        online: 'Online (Synced)',
        offline: 'Offline Mode (Local Engine)',
        syncing: 'Syncing Queue...',
        syncAlert: 'Sync Attention Required'
      },
      fee: {
        admissionFee: 'Admission Fee',
        tuitionFee: 'Tuition Fee',
        assigned: 'Assigned',
        paid: 'Paid',
        outstanding: 'Outstanding',
        totalOutstanding: 'Total Outstanding',
        cash: 'Cash',
        upi: 'UPI'
      },
      student: {
        searchPlaceholder: 'Search by student name, admission no, or phone...',
        admissionNo: 'Admission No',
        name: 'Student Name',
        fatherName: "Father's Name",
        motherName: "Mother's Name",
        phone: 'Phone Number',
        class: 'Class',
        dateOfAdmission: 'Date of Admission',
        address: 'Address',
        statusLabel: 'Status',
        addStudent: 'Add Student'
      },
      actions: {
        recordPayment: 'Record Payment',
        correctPayment: 'Correct Payment',
        exportPdf: 'Export PDF Report',
        save: 'Save',
        cancel: 'Cancel',
        submitting: 'Processing...'
      }
    }
  },
  te: {
    translation: {
      appName: 'శిక్షా అకాడమీ',
      appSubtitle: 'ట్యూషన్ ఫీజు & అకాడమీ నిర్వహణ వ్యవస్థ',
      nav: {
        dashboard: 'డాష్‌బోర్డ్',
        students: 'విద్యార్థులు',
        fees: 'ఫీజు నిబంధనలు',
        payments: 'చెల్లింపులు',
        reports: 'నివేదికలు',
        audit: 'ఆడిట్ రికార్డులు',
        sync: 'సింక్ కేంద్రం',
        logout: 'లాగౌట్'
      },
      status: {
        online: 'ఆన్‌లైన్ (సింక్ చేయబడింది)',
        offline: 'ఆఫ్‌లైన్ మోడ్ (లోకల్ మోడ్)',
        syncing: 'సింక్ అవుతోంది...',
        syncAlert: 'సింక్ హెచ్చరిక'
      },
      fee: {
        admissionFee: 'ప్రవేశ రుసుము (Admission Fee)',
        tuitionFee: 'బోధనా రుసుము (Tuition Fee)',
        assigned: 'కేటాయించిన ఫీజు',
        paid: 'చెల్లించిన ఫీజు',
        outstanding: 'బాకీ మొత్తం',
        totalOutstanding: 'మొత్తం బాకీ',
        cash: 'నగదు (Cash)',
        upi: 'యూపీఐ (UPI)'
      },
      student: {
        searchPlaceholder: 'పేరు, అడ్మిషన్ సంఖ్య లేదా ఫోన్ ద్వారా వెతకండి...',
        admissionNo: 'అడ్మిషన్ సంఖ్య',
        name: 'విద్యార్థి పేరు',
        fatherName: 'తండ్రి పేరు',
        motherName: 'తల్లి పేరు',
        phone: 'ఫోన్ నంబర్',
        class: 'తరగతి',
        dateOfAdmission: 'చేరిన తేదీ',
        address: 'చిరునామా',
        statusLabel: 'స్థితి',
        addStudent: 'కొత్త విద్యార్థిని చేర్చు'
      },
      actions: {
        recordPayment: 'చెల్లింపును నమోదు చేయండి',
        correctPayment: 'చెల్లింపును సవరించండి',
        exportPdf: 'PDF నివేదిక డౌన్‌లోడ్',
        save: 'సేవ్ చేయి',
        cancel: 'రద్దు చేయి',
        submitting: 'నమోదు అవుతోంది...'
      }
    }
  },
  hi: {
    translation: {
      appName: 'शिक्षा अकादमी',
      appSubtitle: 'ट्यूशन शुल्क एवं अकादमी प्रशासन',
      nav: {
        dashboard: 'डैशबोर्ड',
        students: 'छात्र',
        fees: 'शुल्क संरचना',
        payments: 'भुगतान',
        reports: 'रिपोर्ट्स',
        audit: 'ऑडिट लॉग',
        sync: 'सिंक केंद्र',
        logout: 'लॉग आउट'
      },
      status: {
        online: 'ऑनलाइन (सिंक किया गया)',
        offline: 'ऑफ़लाइन मोड (लोकल)',
        syncing: 'सिंक हो रहा है...',
        syncAlert: 'सिंक अलर्ट'
      },
      fee: {
        admissionFee: 'प्रवेश शुल्क (Admission Fee)',
        tuitionFee: 'शिक्षण शुल्क (Tuition Fee)',
        assigned: 'आवंटित शुल्क',
        paid: 'भुगतान किया गया',
        outstanding: 'बकाया राशि',
        totalOutstanding: 'कुल बकाया',
        cash: 'नकद (Cash)',
        upi: 'यूपीआई (UPI)'
      },
      student: {
        searchPlaceholder: 'छात्र का नाम, प्रवेश संख्या या फोन से खोजें...',
        admissionNo: 'प्रवेश संख्या',
        name: 'छात्र का नाम',
        fatherName: 'पिता का नाम',
        motherName: 'माता का नाम',
        phone: 'फोन नंबर',
        class: 'कक्षा',
        dateOfAdmission: 'प्रवेश तिथि',
        address: 'पता',
        statusLabel: 'स्थिति',
        addStudent: 'नया छात्र जोड़ें'
      },
      actions: {
        recordPayment: 'भुगतान दर्ज करें',
        correctPayment: 'भुगतान सुधारें',
        exportPdf: 'PDF रिपोर्ट डाउनलोड करें',
        save: 'सहेजें',
        cancel: 'रद्द करें',
        submitting: 'प्रक्रिया जारी...'
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('shiksha_lang') || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
