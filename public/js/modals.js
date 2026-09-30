// Custom modal dialogs to replace browser alert/confirm

// Show a custom alert modal
function showAlert(message, title = 'Alert', callback = null) {
  const modal = document.createElement('div');
  modal.id = 'customAlertModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease-in;
  `;
  
  modal.innerHTML = `
    <div style="
      background: white;
      border-radius: 12px;
      padding: 0;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease-out;
      overflow: hidden;
    ">
      <div style="
        background: linear-gradient(135deg, #007BFF 0%, #0056b3 100%);
        color: white;
        padding: 20px;
        font-size: 1.3rem;
        font-weight: bold;
      ">
        ${title}
      </div>
      <div style="padding: 30px; color: #333; line-height: 1.6; white-space: pre-wrap;">
        ${message}
      </div>
      <div style="
        padding: 15px 20px;
        background: #f8f9fa;
        border-top: 1px solid #dee2e6;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      ">
        <button onclick="document.getElementById('customAlertModal').remove()" style="
          padding: 10px 25px;
          background: #007BFF;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        " onmouseover="this.style.background='#0056b3'" onmouseout="this.style.background='#007BFF'">
          OK
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      if (callback) callback();
    }
  });
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
      if (callback) callback();
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  // Focus the OK button
  setTimeout(() => {
    const okButton = modal.querySelector('button');
    if (okButton) okButton.focus();
  }, 100);
}

// Show a custom confirm modal
function showConfirm(message, title = 'Confirm', callback = null) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.id = 'customConfirmModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.2s ease-in;
    `;
    
    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 0;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.3s ease-out;
        overflow: hidden;
      ">
        <div style="
          background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
          color: white;
          padding: 20px;
          font-size: 1.3rem;
          font-weight: bold;
        ">
          ${title}
        </div>
        <div style="padding: 30px; color: #333; line-height: 1.6; white-space: pre-wrap;">
          ${message}
        </div>
        <div style="
          padding: 15px 20px;
          background: #f8f9fa;
          border-top: 1px solid #dee2e6;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        ">
          <button id="confirmCancel" style="
            padding: 10px 25px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
          " onmouseover="this.style.background='#5a6268'" onmouseout="this.style.background='#6c757d'">
            Cancel
          </button>
          <button id="confirmOK" style="
            padding: 10px 25px;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
          " onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'">
            Confirm
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = (result) => {
      modal.remove();
      if (callback) callback(result);
      resolve(result);
    };
    
    // Button handlers
    modal.querySelector('#confirmCancel').addEventListener('click', () => closeModal(false));
    modal.querySelector('#confirmOK').addEventListener('click', () => closeModal(true));
    
    // Close on background click (cancel)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(false);
      }
    });
    
    // Close on Escape key (cancel)
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal(false);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Focus the Cancel button
    setTimeout(() => {
      const cancelButton = modal.querySelector('#confirmCancel');
      if (cancelButton) cancelButton.focus();
    }, 100);
  });
}

// Add CSS animations
if (!document.getElementById('modalStyles')) {
  const style = document.createElement('style');
  style.id = 'modalStyles';
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}

// Export to window for global access
window.showAlert = showAlert;
window.showConfirm = showConfirm;

