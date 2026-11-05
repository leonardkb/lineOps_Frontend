// components/FabricWH/FabricSkytexRequest.jsx
// Almacén de Tela — Rollos de Skytex.
// Shows the transfers Skytex pushes automatically to Skyrina (FabricSkytexTransfers).
import { PageHeader } from "./fabricShared";
import FabricSkytexTransfers from "./FabricSkytexTransfers";

export default function FabricSkytexRequest({ onNavigate = () => {} }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rollos de Skytex"
        subtitle="Transferencias que Skytex envía automáticamente a Skyrina."
      />
      <FabricSkytexTransfers onNavigate={onNavigate} />
    </div>
  );
}