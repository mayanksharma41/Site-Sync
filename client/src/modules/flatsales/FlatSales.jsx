import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const FlatSales = () => {
  const { userRole } = useAuth();
  const [formData, setFormData] = useState({
    bhk: '2',
    squareFeet: '',
    pricePerSqFt: '',
    location: '',
    floorNumber: '',
    facing: '',
    furnishing: 'unfurnished',
    parking: '0',
    age: 'new'
  });

  const [additionalCharges, setAdditionalCharges] = useState([]);
  const [newCharge, setNewCharge] = useState({ name: '', amount: '' });
  const [result, setResult] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addCharge = () => {
    if (newCharge.name && newCharge.amount) {
      setAdditionalCharges([...additionalCharges, { ...newCharge, id: Date.now() }]);
      setNewCharge({ name: '', amount: '' });
    }
  };

  const removeCharge = (id) => {
    setAdditionalCharges(additionalCharges.filter(charge => charge.id !== id));
  };

  const calculatePrice = () => {
    if (!formData.squareFeet || !formData.pricePerSqFt) {
      alert('Please enter Square Feet and Price per Sq.Ft');
      return;
    }

    const basePrice = parseFloat(formData.squareFeet) * parseFloat(formData.pricePerSqFt);
    
    let furnishingCost = 0;
    if (formData.furnishing === 'semi') furnishingCost = basePrice * 0.05;
    if (formData.furnishing === 'fully') furnishingCost = basePrice * 0.12;

    const parkingCost = parseInt(formData.parking) * 150000;

    const totalAdditional = additionalCharges.reduce((sum, charge) => 
      sum + parseFloat(charge.amount || 0), 0);

    const totalPrice = basePrice + furnishingCost + parkingCost + totalAdditional;

    setResult({
      basePrice,
      furnishingCost,
      parkingCost,
      additionalCharges: totalAdditional,
      totalPrice
    });
  };

  const resetForm = () => {
    setFormData({
      bhk: '2',
      squareFeet: '',
      pricePerSqFt: '',
      location: '',
      floorNumber: '',
      facing: '',
      furnishing: 'unfurnished',
      parking: '0',
      age: 'new'
    });
    setAdditionalCharges([]);
    setNewCharge({ name: '', amount: '' });
    setResult(null);
  };

  const formatCurrency = (amount) => {
    if (!amount || isNaN(amount)) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (userRole !== 'manager' && userRole !== 'owner') {
    return (
      <div style={{ 
        width: '100%',
        maxWidth: '100%',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2>Access Restricted</h2>
        <p style={{ color: '#6b7280' }}>Only managers and owners can access flat sales calculator.</p>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100%',
      maxWidth: '100%',
      padding: windowWidth <= 768 ? '1rem' : '2rem',
      boxSizing: 'border-box',
      background: '#f3f4f6',
      minHeight: '100vh'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          padding: windowWidth <= 480 ? '1.5rem' : '2rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <div style={{
              background: '#2563eb',
              padding: '0.75rem',
              borderRadius: '12px',
              color: 'white',
              fontSize: '1.5rem'
            }}>
              🏠
            </div>
            <div>
              <h1 style={{ 
                margin: 0, 
                fontSize: windowWidth <= 480 ? '1.5rem' : '2rem',
                color: '#1f2937',
                fontWeight: 'bold'
              }}>
                Flat Price Calculator
              </h1>
              <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
                Calculate your property investment accurately
              </p>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          padding: windowWidth <= 480 ? '1.5rem' : '2rem',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ 
            margin: '0 0 1.5rem 0', 
            fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem',
            color: '#1f2937',
            fontWeight: '600'
          }}>
            Property Details
          </h2>
          
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: windowWidth <= 480 ? '1fr' : windowWidth <= 768 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: '1rem'
          }}>
            {/* BHK Selection */}
            <div>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                BHK Type
              </label>
              <select
                name="bhk"
                value={formData.bhk}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="1">1 BHK</option>
                <option value="2">2 BHK</option>
                <option value="3">3 BHK</option>
                <option value="4">4 BHK</option>
                <option value="5">5+ BHK</option>
              </select>
            </div>

            {/* Square Feet */}
            <div>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Square Feet *
              </label>
              <input
                type="number"
                name="squareFeet"
                value={formData.squareFeet}
                onChange={handleInputChange}
                placeholder="Enter area in sq.ft"
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Price per sq ft */}
            <div>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Price per Sq.Ft (₹) *
              </label>
              <input
                type="number"
                name="pricePerSqFt"
                value={formData.pricePerSqFt}
                onChange={handleInputChange}
                placeholder="Enter rate"
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Location */}
            <div>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Location
              </label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                placeholder="Enter location"
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Floor Number */}
            <div>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Floor Number
              </label>
              <input
                type="number"
                name="floorNumber"
                value={formData.floorNumber}
                onChange={handleInputChange}
                placeholder="Enter floor"
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Facing */}
            <div>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Facing
              </label>
              <select
                name="facing"
                value={formData.facing}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select Facing</option>
                <option value="north">North</option>
                <option value="south">South</option>
                <option value="east">East</option>
                <option value="west">West</option>
                <option value="northeast">North-East</option>
                <option value="northwest">North-West</option>
                <option value="southeast">South-East</option>
                <option value="southwest">South-West</option>
              </select>
            </div>

            {/* Furnishing */}
            <div>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Furnishing Status
              </label>
              <select
                name="furnishing"
                value={formData.furnishing}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="unfurnished">Unfurnished</option>
                <option value="semi">Semi-Furnished (+5%)</option>
                <option value="fully">Fully-Furnished (+12%)</option>
              </select>
            </div>

            {/* Parking */}
            <div>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Parking Spaces
              </label>
              <select
                name="parking"
                value={formData.parking}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="0">No Parking</option>
                <option value="1">1 Space (₹1.5L)</option>
                <option value="2">2 Spaces (₹3L)</option>
                <option value="3">3 Spaces (₹4.5L)</option>
              </select>
            </div>

            {/* Property Age */}
            <div>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Property Age
              </label>
              <select
                name="age"
                value={formData.age}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="new">New/Under Construction</option>
                <option value="1-5">1-5 Years</option>
                <option value="5-10">5-10 Years</option>
                <option value="10+">10+ Years</option>
              </select>
            </div>
          </div>
        </div>

        {/* Additional Charges */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          padding: windowWidth <= 480 ? '1.5rem' : '2rem',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ 
            margin: '0 0 1rem 0', 
            fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem',
            color: '#1f2937',
            fontWeight: '600'
          }}>
            Additional Charges
          </h2>
          
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem',
            marginBottom: '1rem',
            flexWrap: 'wrap'
          }}>
            <input
              type="text"
              placeholder="Charge name (e.g., Maintenance)"
              value={newCharge.name}
              onChange={(e) => setNewCharge({ ...newCharge, name: e.target.value })}
              style={{ 
                flex: 1,
                minWidth: '200px',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
            />
            <input
              type="number"
              placeholder="Amount (₹)"
              value={newCharge.amount}
              onChange={(e) => setNewCharge({ ...newCharge, amount: e.target.value })}
              style={{ 
                width: windowWidth <= 480 ? '100%' : '150px',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
            />
            <button
              onClick={addCharge}
              style={{
                background: '#2563eb',
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                whiteSpace: 'nowrap'
              }}
            >
              <span>+</span> Add
            </button>
          </div>

          {additionalCharges.length > 0 && (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {additionalCharges.map(charge => (
                <div key={charge.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f9fafb',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px'
                }}>
                  <span style={{ fontWeight: '600', color: '#374151' }}>
                    {charge.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: '#1f2937', fontWeight: '600' }}>
                      {formatCurrency(charge.amount)}
                    </span>
                    <button
                      onClick={() => removeCharge(charge.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '1.25rem',
                        padding: '0.25rem',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={calculatePrice}
            disabled={!formData.squareFeet || !formData.pricePerSqFt}
            style={{
              flex: 1,
              minWidth: '200px',
              background: (!formData.squareFeet || !formData.pricePerSqFt)
                ? '#9ca3af'
                : '#2563eb',
              color: 'white',
              padding: '1rem',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '600',
              border: 'none',
              cursor: (!formData.squareFeet || !formData.pricePerSqFt) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <span>🧮</span> Calculate Price
          </button>
          <button
            onClick={resetForm}
            style={{
              padding: '1rem 2rem',
              background: '#374151',
              color: 'white',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Reset
          </button>
        </div>

        {/* Result */}
        {result && (
          <div style={{
            background: '#2563eb',
            borderRadius: '16px',
            boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
            padding: windowWidth <= 480 ? '1.5rem' : '2rem',
            color: 'white'
          }}>
            <h2 style={{ 
              margin: '0 0 1.5rem 0', 
              fontSize: windowWidth <= 480 ? '1.5rem' : '2rem',
              fontWeight: 'bold'
            }}>
              Price Breakdown
            </h2>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 0',
                borderBottom: '1px solid rgba(255,255,255,0.2)'
              }}>
                <span style={{ color: 'rgba(255,255,255,0.9)' }}>Base Price</span>
                <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>
                  {formatCurrency(result.basePrice)}
                </span>
              </div>
              
              {result.furnishingCost > 0 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 0',
                  borderBottom: '1px solid rgba(255,255,255,0.2)'
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.9)' }}>Furnishing Cost</span>
                  <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>
                    {formatCurrency(result.furnishingCost)}
                  </span>
                </div>
              )}
              
              {result.parkingCost > 0 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 0',
                  borderBottom: '1px solid rgba(255,255,255,0.2)'
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.9)' }}>Parking Cost</span>
                  <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>
                    {formatCurrency(result.parkingCost)}
                  </span>
                </div>
              )}
              
              {result.additionalCharges > 0 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 0',
                  borderBottom: '1px solid rgba(255,255,255,0.2)'
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.9)' }}>Additional Charges</span>
                  <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>
                    {formatCurrency(result.additionalCharges)}
                  </span>
                </div>
              )}
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '1.5rem'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Total Price</span>
                <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                  {formatCurrency(result.totalPrice)}
                </span>
              </div>
            </div>

            {formData.location && (
              <div style={{
                marginTop: '1rem',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                color: 'rgba(255,255,255,0.9)'
              }}>
                <p style={{ margin: 0 }}>
                  {formData.bhk} BHK • {formData.squareFeet} sq.ft • {formData.location}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FlatSales;
