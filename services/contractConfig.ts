// Auto-generated — do not edit manually
// Redeploy with: .\forge.exe create contracts/MedicalVault.sol:MedicalVault --rpc-url http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast

export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const CONTRACT_ABI = [
    "function addRecord(string memory _cid, string memory _name) public",
    "function setDoctorAccess(address _doctor, bool _status) public",
    "function getRecords(address _patient) public view returns (tuple(string ipfsCid, string fileName, uint256 timestamp, address owner)[])",
    "function authorizedDoctors(address, address) public view returns (bool)",
];