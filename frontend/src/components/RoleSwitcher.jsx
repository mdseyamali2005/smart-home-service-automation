/**
 * RoleSwitcher — Toggle between Customer and Provider views without login.
 * Displayed in the navbar for quick role switching.
 */

export default function RoleSwitcher({ role, onRoleChange }) {
  return (
    <div className="role-switcher">
      <button
        className={role === 'customer' ? 'active' : ''}
        onClick={() => onRoleChange('customer')}
      >
        🏠 Customer
      </button>
      <button
        className={role === 'provider' ? 'active' : ''}
        onClick={() => onRoleChange('provider')}
      >
        🔧 Provider
      </button>
    </div>
  );
}
