import getRenderWrapper from '@salesforce/apex/GE_TemplateBuilderCtrl.retrieveDefaultSGERenderWrapper';
import getAllocationSettings from '@salesforce/apex/GE_FormRendererService.getAllocationsSettings';
import saveAndProcessDataImport from '@salesforce/apex/GE_GiftEntryController.saveAndProcessDataImport';
import { handleError } from 'c/utilTemplateBuilder';
import saveAndDryRunDataImport
    from '@salesforce/apex/GE_GiftEntryController.saveAndDryRunDataImport';
import { api } from "lwc";
import { isNotEmpty, isEmpty } from 'c/utilCommon';
import getFormRenderWrapper
    from '@salesforce/apex/GE_FormServiceController.getFormRenderWrapper';
import OPPORTUNITY_AMOUNT from '@salesforce/schema/Opportunity.Amount';
import OPPORTUNITY_OBJECT from '@salesforce/schema/Opportunity';

import insertDataImport from '@salesforce/apex/GE_GiftEntryController.insertDataImport';
import makePurchaseCall from '@salesforce/apex/GE_GiftEntryController.makePurchaseCall';
import updateDataImport from '@salesforce/apex/GE_GiftEntryController.updateDataImport';
import processDataImport from '@salesforce/apex/GE_GiftEntryController.processDataImport';

// https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_enum_Schema_DisplayType.htm
// this list only includes fields that can be handled by lightning-input
const inputTypeByDescribeType = {
    'BOOLEAN': 'checkbox',
    'CURRENCY': 'number',
    'DATE': 'date',
    'DATETIME': 'datetime-local',
    'EMAIL': 'email',
    'DOUBLE': 'number',
    'INTEGER': 'number',
    'LONG': 'number',
    'PERCENT': 'number',
    'STRING': 'text',
    'PHONE': 'tel',
    'TEXT': 'text',
    'TIME': 'time',
    'URL': 'url'
};

const numberFormatterByDescribeType = {
    'PERCENT': 'percent-fixed',
    'CURRENCY': 'currency',
    'DECIMAL': 'decimal'
};

class GeFormService {

    fieldMappings;
    objectMappings;
    fieldTargetMappings;
    donationFieldTemplateLabel;

    /**
     * Retrieve the default form render wrapper.
     * @returns {Promise<FORM_RenderWrapper>}
     */
    @api
    getFormTemplate() {
        return new Promise((resolve, reject) => {
            getRenderWrapper({})
                .then((result) => {
                    this.fieldMappings = result.fieldMappingSetWrapper.fieldMappingByDevName;
                    this.objectMappings = result.fieldMappingSetWrapper.objectMappingByDevName;
                    this.fieldTargetMappings = result.fieldMappingSetWrapper.fieldMappingByTargetFieldName;
                    if (isEmpty(this.donationFieldTemplateLabel)) {
                        this.donationFieldTemplateLabel = this.getDonationAmountCustomLabel(result.formTemplate);
                    }
                    resolve(result);
                })
                .catch(error => {
                    handleError(error);
                });
        });
    }

    getAllocationSettings() {
        return new Promise((resolve, reject) => {
            getAllocationSettings()
                .then(resolve)
                .catch(handleError)
        });
    }

    /**
     * Get the type of lightning-input that should be used for a given field type.
     * @param dataType  Data type of the field
     * @returns {String}
     */
    getInputTypeFromDataType(dataType) {
        return inputTypeByDescribeType[dataType];
    }

    /**
     * Get the formatter for a lightning-input that should be used for a given field type
     * @param dataType  Data type of the field
     * @returns {String | undefined}
     */
    getNumberFormatterByDescribeType(dataType) {
        return numberFormatterByDescribeType[dataType];
    }

    /**
     * Get a field info object by dev name from the render wrapper object
     * @param fieldDevName  Dev name of the object to retrieve
     * @returns {BDI_FieldMapping}
     */
    getFieldMappingWrapper(fieldDevName) {
        return this.fieldMappings[fieldDevName];
    }

    /**
     * Get a field info object by dev name from the render wrapper object
     * @param fieldDevName  Dev name of the object to retrieve
     * @returns {BDI_FieldMapping}
     */
    getFieldMappingWrapperFromTarget(targetFieldName) {
        return this.fieldTargetMappings[targetFieldName];
    }

    /**
     * Get a object info object by dev name from the render wrapper object
     * @param objectDevName
     * @returns {BDI_ObjectMapping}
     */
    getObjectMappingWrapper(objectDevName) {
        return this.objectMappings[objectDevName];
    }

    /**
     * Get the user-defined label used for the Opportunity Amount field on the
     * @return {string}
     */
    getDonationAmountCustomLabel(formTemplate) {
        // find field that is mapped to Opportunity Amount
        const mapping = this.getFieldMappingWrapperFromTarget(`${OPPORTUNITY_OBJECT.objectApiName}.${OPPORTUNITY_AMOUNT.fieldApiName}`);
        const mappingDevName = mapping.DeveloperName;
        // get developer name of mapping cmt
        let fieldElement;
        for (const section of formTemplate.layout.sections) {
            fieldElement = section.elements.find(element => {
                if (Array.isArray(element.dataImportFieldMappingDevNames)) {
                    return element.dataImportFieldMappingDevNames.includes(mappingDevName);
                }
            });
        }

        if (isNotEmpty(fieldElement)) {
            // return custom label from the form template layout
            return fieldElement.customLabel;
        }
    }

    /**
     * Takes a Data Import record and additional object data, processes it, and returns the new Opportunity created from it.
     * @param createdDIRecord
     * @param widgetValues
     * @returns {Promise<Id>}
     */
    /*saveAndProcessDataImport(createdDIRecord, widgetValues, hasUserSelectedDonation = false) {
        const widgetDataString = JSON.stringify(widgetValues);
        return new Promise((resolve, reject) => {
            saveAndProcessDataImport({
                    diRecord: createdDIRecord,
                    widgetData: widgetDataString,
                    updateGift: hasUserSelectedDonation
                })
                .then((result) => {
                    resolve(result);
                })
                .catch(error => {
                    console.error(JSON.stringify(error));
                    reject(error);
                });
        });
    }*/

    /**
     * Takes a Data Import record and additional object data, processes it, and returns the new Opportunity created from it.
     * @param createdDIRecord
     * @param widgetValues
     * @returns {Promise<Id>}
     */
    async saveAndProcessDataImport(createdDIRecord, widgetValues, hasUserSelectedDonation = false, token) {
        try {
            console.log('*** saveAndProcessDataImport');
            console.log('token: ', token);
            const widgetDataString = JSON.stringify(widgetValues);

            let dataImportRecord = null;
            let purchaseResponse = null;
            let updatedDataImportRecord = null;
            let processResponse = null;

            dataImportRecord = await insertDataImport({
                diRecord: createdDIRecord,
                widgetData: widgetDataString
            });
            console.log('dataImportRecord: ', dataImportRecord);

            purchaseResponse = await makePurchaseCall({
                token: token
            });
            console.log('purchaseResponse: ', purchaseResponse);
            // Write purchase response to dataImportRecord

            updatedDataImportRecord = await updateDataImport({
                diRecord: dataImportRecord
            });
            console.log('updatedDataImportRecord: ', updatedDataImportRecord);

            // Make process call
            processResponse = await processDataImport({
                diRecord: updatedDataImportRecord,
                updateGift: hasUserSelectedDonation
            });
            console.log('processResponse: ', processResponse);
        } catch (error) {
            handleError(error);
        }
    }

    /**
     * Takes a list of sections, reads the fields and values, creates a di record, and creates an opportunity from the di record
     * @param sectionList
     * @returns opportunityId
     */
    handleSave(sectionList, record, dataImportRecord) {
        console.log('*** handleSave');
        const { diRecord, widgetValues, token } = this.getDataImportRecord(sectionList, record, dataImportRecord);
        console.log('token: ', token);
        const hasUserSelectedDonation = isNotEmpty(dataImportRecord);

        const opportunityID = this.saveAndProcessDataImport(diRecord, widgetValues, hasUserSelectedDonation, token);

        return opportunityID;
    }

    /**
     * Grab the data from the form fields and widgets, convert to a data import record.
     * @param sectionList   List of ge-form-sections on the form
     * @param record        Existing account or contact record to attach to the data import record
     * @return {{widgetValues: {}, diRecord: {}}}
     */
    getDataImportRecord(sectionList, record, dataImportRecord) {
        // Gather all the data from the input
        let fieldData = {};
        let widgetValues = {};
        let token = null;

        sectionList.forEach(section => {
            fieldData = { ...fieldData, ...(section.values) };
            widgetValues = { ...widgetValues, ...(section.widgetValues) };
            let temp = section.getToken();
            console.log('service.getToken: ', temp);
            if (temp) {
                token = temp;
            }
        });

        // Build the DI Record
        let diRecord = {};

        for (let key in fieldData) {
            if (fieldData.hasOwnProperty(key)) {
                let value = fieldData[key];

                // Get the field mapping wrapper with the CMT record name (this is the key variable).
                let fieldWrapper = this.getFieldMappingWrapper(key);

                if (value) {
                    diRecord[fieldWrapper.Source_Field_API_Name] = value;
                }
            }
        }

        // Include any fields from a user selected donation
        diRecord = { ...diRecord, ...dataImportRecord };

        return { diRecord, widgetValues, token };
    }

    saveAndDryRun(batchId, dataImport, widgetData) {
        return new Promise((resolve, reject) => {
            saveAndDryRunDataImport({ batchId, dataImport, widgetData })
                .then((result) => {
                    resolve(JSON.parse(result));
                })
                .catch(error => {
                    reject(error);
                });
        });
    }

    getFormRenderWrapper(templateId) {
        return new Promise((resolve, reject) => {
            getFormRenderWrapper({ templateId: templateId })
                .then(renderWrapper => {
                    this.fieldMappings =
                        renderWrapper.fieldMappingSetWrapper.fieldMappingByDevName;
                    this.objectMappings =
                        renderWrapper.fieldMappingSetWrapper.objectMappingByDevName;
                    this.fieldTargetMappings =
                        renderWrapper.fieldMappingSetWrapper.fieldMappingByTargetFieldName;
                    resolve(renderWrapper);
                })
                .catch(err => {
                    reject(err);
                });
        });

    }

    getFormTemplateById(templateId) {
        return new Promise((resolve, reject) => {
            this.getFormRenderWrapper(templateId)
                .then(renderWrapper => {
                    resolve(renderWrapper.formTemplate);
                })
                .catch(err => {
                    reject(err);
                });
        });
    }

}

const geFormServiceInstance = new GeFormService();

export default geFormServiceInstance;