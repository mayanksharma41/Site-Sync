import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTranslation } from '../hooks/useTranslation';

const Navbar = () => {
  const { signout, userRole } = useAuth();
  const { language, changeLanguage } = useLanguage();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageSelectorRef = React.useRef(null);

  // Close language menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (languageSelectorRef.current && !languageSelectorRef.current.contains(event.target)) {
        setLanguageMenuOpen(false);
      }
    };

    if (languageMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [languageMenuOpen]);

  const handleSignout = async () => {
    setMobileMenuOpen(false);
    await signout();
    navigate('/login');
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  // Role-based navigation links
  const getNavLinks = () => {
    switch (userRole) {
      case 'worker':
        return (
          <>
            <NavLink to="/dashboard">{t('common.dashboard')}</NavLink>
            <NavLink to="/attendance">{t('common.attendance')}</NavLink>
            <NavLink to="/worklogs">{t('common.workLogs') || 'Work Logs'}</NavLink>
            <NavLink to="/pettycash">{t('common.pettyCash') || 'Petty Cash'}</NavLink>
            <NavLink to="/tools">Tool Library</NavLink>
          </>
        );
      
      case 'site_engineer':
        return (
          <>
            <NavLink to="/dashboard">{t('common.dashboard')}</NavLink>
            <NavLink to="/projects">{t('common.projects')}</NavLink>
            <NavLink to="/employees">{t('worker') || 'Worker'}</NavLink>
            <NavLink to="/dpr">{t('common.dpr')}</NavLink>
            <NavLink to="/materials">{t('common.materials')}</NavLink>
            <NavLink to="/attendance">{t('common.attendance')}</NavLink>
            <NavLink to="/tasks">{t('common.tasks')}</NavLink>
            <NavLink to="/worklogs">{t('common.workLogs') || 'Work Logs'}</NavLink>
            <NavLink to="/stock">{t('stock') || 'Stock'}</NavLink>
            <NavLink to="/pettycash">{t('common.pettyCash') || 'Petty Cash'}</NavLink>
            <NavLink to="/tools">Tool Library</NavLink>
            <NavLink to="/permits">Permit-to-Work</NavLink>
          </>
        );
      
      case 'manager':
        return (
          <>
            <NavLink to="/dashboard">{t('common.dashboard')}</NavLink>
            <NavLink to="/projects">{t('common.projects')}</NavLink>
            <NavLink to="/materials">{t('common.materials')}</NavLink>
            <NavLink to="/tasks">{t('common.tasks')}</NavLink>
            <NavLink to="/dpr">{t('common.dpr')}</NavLink>
            <NavLink to="/contractors">{t('contractors') || 'Contractors'}</NavLink>
            <NavLink to="/flatsales">{t('flatSales') || 'Flat Sales'}</NavLink>
            <NavLink to="/stock">{t('stock') || 'Stock Tracking'}</NavLink>
            <NavLink to="/bills">{t('common.gstBills')}</NavLink>
          </>
        );
      
      case 'owner':
        return (
          <>
            <NavLink to="/dashboard">{t('common.dashboard')}</NavLink>
            <NavLink to="/contractors">{t('contractors') || 'Contractors'}</NavLink>
            <NavLink to="/stock">{t('stock') || 'Stock Tracking'}</NavLink>
            <NavLink to="/bills">{t('common.gstBills')}</NavLink>
          </>
        );
      
      default:
        return (
          <>
            <NavLink to="/dashboard">{t('common.dashboard')}</NavLink>
          </>
        );
    }
  };

  const getRoleDisplayName = (role) => {
    const roleNames = {
      'worker': t('common.worker') || 'Worker',
      'site_engineer': t('common.siteEngineer') || 'Site Engineer',
      'manager': t('common.manager') || 'Manager',
      'owner': t('common.owner') || 'Owner'
    };
    return roleNames[role] || role?.replace('_', ' ') || 'User';
  };

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'hi', name: 'हिंदी', flag: '🇮🇳' },
    { code: 'ta', name: 'தமிழ்', flag: '🇮🇳' },
    { code: 'mr', name: 'मराठी', flag: '🇮🇳' }
  ];

  const currentLanguage = languages.find(lang => lang.code === language) || languages[0];

  const handleLanguageChange = (langCode) => {
    changeLanguage(langCode);
    setLanguageMenuOpen(false);
  };

  const getRoleColor = (role) => {
    const colors = {
      'worker': '#3b82f6',
      'site_engineer': '#8b5cf6',
      'manager': '#f59e0b',
      'owner': '#ef4444'
    };
    return colors[role] || '#6b7280';
  };

  return (
    <>
      <style>{`
        .navbar-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background-color: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .navbar-inner {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
        }
        
        .navbar-spacer {
          height: 64px;
        }
        
        .navbar-logo-link {
          text-decoration: none;
        }
        
        .navbar-logo-text {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 0;
          color: #111827;
          letter-spacing: -0.025em;
        }
        
        .navbar-desktop {
          display: flex;
          align-items: center;
          flex: 1;
          min-width: 0;
          margin: 0 1rem;
        }
        
        .navbar-links {
          display: flex;
          gap: 0.25rem;
          align-items: center;
          overflow-x: auto;
        }
        
        .navbar-link {
          text-decoration: none;
          color: #6b7280;
          font-size: 0.9375rem;
          font-weight: 500;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        
        .navbar-link:hover {
          background-color: #f3f4f6;
          color: #111827;
        }
        
        .navbar-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-shrink: 0;
        }
        
        .navbar-language-selector {
          position: relative;
        }
        
        .navbar-language-btn {
          background-color: transparent;
          border: 1px solid #e5e7eb;
          padding: 0.375rem 0.75rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #374151;
        }
        
        .navbar-language-btn:hover {
          background-color: #f9fafb;
          border-color: #d1d5db;
        }
        
        .navbar-language-menu {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          background-color: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          min-width: 160px;
          z-index: 1001;
          overflow: hidden;
        }
        
        .navbar-language-option {
          padding: 0.625rem 1rem;
          cursor: pointer;
          transition: background-color 0.15s ease;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.875rem;
          color: #374151;
        }
        
        .navbar-language-option:hover {
          background-color: #f9fafb;
        }
        
        .navbar-language-option.active {
          background-color: #eff6ff;
          color: #2563eb;
          font-weight: 600;
        }
        
        .navbar-language-flag {
          font-size: 1.125rem;
        }
        
        .navbar-role-badge {
          padding: 0.375rem 0.875rem;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          letter-spacing: 0.025em;
        }
        
        .navbar-role-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: currentColor;
        }
        
        .navbar-logout-btn {
          background-color: #111827;
          color: #ffffff;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.9375rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        
        .navbar-logout-btn:hover {
          background-color: #1f2937;
        }
        
        .navbar-logout-btn:active {
          transform: scale(0.98);
        }
        
        .navbar-mobile-btn {
          display: none;
          flex-shrink: 0;
          background-color: transparent;
          border: 1px solid #e5e7eb;
          width: 36px;
          height: 36px;
          border-radius: 6px;
          cursor: pointer;
          padding: 0;
          color: #374151;
          align-items: center;
          justify-content: center;
        }
        
        .navbar-mobile-btn:hover {
          background-color: #f9fafb;
        }
        
        .navbar-hamburger {
          display: flex;
          flex-direction: column;
          gap: 4px;
          width: 18px;
        }
        
        .navbar-hamburger span {
          display: block;
          height: 2px;
          background-color: currentColor;
          border-radius: 2px;
          transition: all 0.2s ease;
        }
        
        .navbar-hamburger.open span:nth-child(1) {
          transform: rotate(45deg) translate(5px, 5px);
        }
        
        .navbar-hamburger.open span:nth-child(2) {
          opacity: 0;
        }
        
        .navbar-hamburger.open span:nth-child(3) {
          transform: rotate(-45deg) translate(5px, -5px);
        }
        
        .navbar-mobile {
          display: none;
          border-top: 1px solid #e5e7eb;
          background-color: #ffffff;
          padding: 1rem;
        }
        
        .navbar-mobile.active {
          display: block;
        }
        
        .navbar-mobile-links {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          margin-bottom: 1rem;
        }
        
        .navbar-mobile-bottom {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }
        
        .navbar-logout-mobile {
          background-color: #111827;
          color: #ffffff;
          border: none;
          padding: 0.625rem 1rem;
          border-radius: 6px;
          font-size: 0.9375rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          width: 100%;
        }
        
        .navbar-logout-mobile:hover {
          background-color: #1f2937;
        }
        
        @media (max-width: 968px) {
          .navbar-desktop {
            display: none;
          }

          .navbar-actions-desktop {
            display: none;
          }
          
          .navbar-mobile-btn {
            display: flex;
          }
        }
      `}</style>
      
      <nav className="navbar-container">
        <div className="navbar-inner">
          <Link to="/dashboard" className="navbar-logo-link">
            <h1 className="navbar-logo-text">SiteSync</h1>
          </Link>

          {/* Desktop Navigation */}
          <div className="navbar-desktop">
            <div className="navbar-links">
              {getNavLinks()}
            </div>
          </div>

          <div className="navbar-actions">
            <div className="navbar-language-selector navbar-actions-desktop" ref={languageSelectorRef}>
              <button 
                type="button"
                className="navbar-language-btn"
                onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
              >
                <span className="navbar-language-flag">{currentLanguage.flag}</span>
                <span>{currentLanguage.name}</span>
              </button>
              {languageMenuOpen && (
                <div className="navbar-language-menu">
                  {languages.map((lang) => (
                    <div
                      key={lang.code}
                      className={`navbar-language-option ${language === lang.code ? 'active' : ''}`}
                      onClick={() => handleLanguageChange(lang.code)}
                    >
                      <span className="navbar-language-flag">{lang.flag}</span>
                      <span>{lang.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div 
              className="navbar-role-badge navbar-actions-desktop"
              style={{
                backgroundColor: getRoleColor(userRole) + '15',
                color: getRoleColor(userRole)
              }}
            >
              <span className="navbar-role-dot"></span>
              {getRoleDisplayName(userRole)}
            </div>
            <button type="button" onClick={handleSignout} className="navbar-logout-btn">
              {t('common.logout') || 'Logout'}
            </button>

            <button type="button" className="navbar-mobile-btn" onClick={toggleMobileMenu} aria-label="Open menu">
              <div className={`navbar-hamburger ${mobileMenuOpen ? 'open' : ''}`}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className={`navbar-mobile ${mobileMenuOpen ? 'active' : ''}`}>
          <div className="navbar-mobile-links">
            {getNavLinks()}
          </div>
          <div className="navbar-mobile-bottom">
            <div 
              className="navbar-role-badge"
              style={{
                backgroundColor: getRoleColor(userRole) + '15',
                color: getRoleColor(userRole)
              }}
            >
              <span className="navbar-role-dot"></span>
              {getRoleDisplayName(userRole)}
            </div>
            {/* Language Selector Mobile */}
            <div className="navbar-language-selector" ref={languageSelectorRef}>
              <button 
                className="navbar-language-btn"
                onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <span className="navbar-language-flag">{currentLanguage.flag}</span>
                <span>{currentLanguage.name}</span>
              </button>
              {languageMenuOpen && (
                <div className="navbar-language-menu" style={{ position: 'relative', top: '0.5rem', width: '100%' }}>
                  {languages.map((lang) => (
                    <div
                      key={lang.code}
                      className={`navbar-language-option ${language === lang.code ? 'active' : ''}`}
                      onClick={() => handleLanguageChange(lang.code)}
                    >
                      <span className="navbar-language-flag">{lang.flag}</span>
                      <span>{lang.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <button type="button" onClick={handleSignout} className="navbar-logout-mobile">
              {t('common.logout') || 'Logout'}
            </button>
          </div>
        </div>
      </nav>
      <div className="navbar-spacer"></div>
    </>
  );
};

const NavLink = ({ to, children }) => {
  return (
    <Link to={to} className="navbar-link">
      {children}
    </Link>
  );
};

export default Navbar;