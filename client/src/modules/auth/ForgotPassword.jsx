import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await resetPassword(email);
      setMessage('Password reset email sent. Check your inbox.');
    } catch (err) {
      setError(err.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '440px', margin: '4rem auto', padding: '1.5rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Reset password</h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
        Enter your account email and we will send a reset link.
      </p>
      {error && <p style={{ color: '#991b1b', marginBottom: '1rem' }}>{error}</p>}
      {message && <p style={{ color: '#065f46', marginBottom: '1rem' }}>{message}</p>}
      <form onSubmit={handleSubmit}>
        <label className="label" htmlFor="reset-email">Email</label>
        <input
          id="reset-email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem' }}
        />
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      <p style={{ marginTop: '1.5rem' }}>
        <Link to="/login">Back to sign in</Link>
      </p>
    </div>
  );
};

export default ForgotPassword;
