// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {MedicalVault} from "contracts/MedicalVault.sol";

contract PatientActor {
    function addRecord(MedicalVault vault, string calldata cid, string calldata name) external {
        vault.addRecord(cid, name);
    }

    function grantDoctor(MedicalVault vault, address doctor) external {
        vault.setDoctorAccess(doctor, true);
    }

    function recordCount(MedicalVault vault) external view returns (uint256) {
        return vault.getRecords(address(this)).length;
    }
}

contract DoctorActor {
    function patientRecordCount(MedicalVault vault, address patient) external view returns (uint256) {
        return vault.getRecords(patient).length;
    }
}

contract MedicalVaultTest {
    MedicalVault private vault;
    PatientActor private patient;
    DoctorActor private doctor;

    function setUp() public {
        vault = new MedicalVault();
        patient = new PatientActor();
        doctor = new DoctorActor();
    }

    function testPatientCanStoreEncryptedFileCid() public {
        patient.addRecord(vault, "bafyEncryptedMedicalRecord", "encrypted-record.enc");

        require(patient.recordCount(vault) == 1, "record was not stored");
    }

    function testAuthorizedDoctorCanReadPatientRecordCount() public {
        patient.addRecord(vault, "bafyEncryptedMedicalRecord", "encrypted-record.enc");
        patient.grantDoctor(vault, address(doctor));

        require(
            doctor.patientRecordCount(vault, address(patient)) == 1,
            "authorized doctor cannot read records"
        );
    }
}
