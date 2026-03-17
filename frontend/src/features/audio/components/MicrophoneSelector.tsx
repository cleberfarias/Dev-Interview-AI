import React from 'react';
import styles from './MicrophoneSelector.module.css';

interface MicrophoneSelectorProps {
  devices: MediaDeviceInfo[];
  value?: string | null;
  disabled?: boolean;
  onChange: (deviceId: string) => void;
}

const MicrophoneSelector: React.FC<MicrophoneSelectorProps> = ({
  devices,
  value,
  disabled = false,
  onChange,
}) => {
  return (
    <div className={styles.wrap}>
      <label htmlFor="microphone-selector" className={styles.label}>
        Microfone ativo
      </label>
      <select
        id="microphone-selector"
        className={styles.select}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || devices.length === 0}
      >
        {devices.length === 0 && <option value="">Nenhum microfone encontrado</option>}
        {devices.map((device, index) => (
          <option key={device.deviceId || `device-${index}`} value={device.deviceId}>
            {device.label || `Microfone ${index + 1}`}
          </option>
        ))}
      </select>
      <p className={styles.hint}>Troque o dispositivo antes de iniciar ou entre respostas.</p>
    </div>
  );
};

export default MicrophoneSelector;
