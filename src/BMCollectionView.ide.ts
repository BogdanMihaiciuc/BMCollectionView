////<reference path="../node_modules/bm-core-ui/lib/@types/BMCoreUI.min.d.ts"/>
///<reference path="../../BMCoreUI/build/ui/BMCoreUI/BMCoreUI.d.ts"/>
///<reference types="velocity-animate"/>

import { TWNamedComposerWidget, property } from 'typescriptwebpacksupport/widgetidesupport';

const EXTENSION_MODE = NO;

// Used to catch bugs related to the previously predefined self variable
declare var self: null;

// Fill-in for missing direct link definition
declare function BMDirectLinkPostWithUUID(...args: any[]): void;

// #region BMWidgetConfigurationWindow

/**
 * The widget configuration window is a full screen window that may be used with certain widgets to make it easier to
 * display and configure their properties, especially when they have a large number of properties that can be logically grouped up into sections.
 */
class BMWidgetConfigurationWindow extends BMWindow {
	
	/**
	 * The widget whose configuration is managed by this configuration window.
	 */
    private _widget!: TWComposerWidget;
    
	/**
	 * The widget whose configuration is managed by this configuration window.
	 */
	get widget() { return this._widget; };
	set widget(widget) {
		this._widget = widget;
	};
	
	
	/**
	 * The sections array containg the major property categories.
	 */
	private _sections: {name: string, label: string}[] = [];
	
	/**
	 * The collection view that will manage the main sections.
	 */
	_groupCollectionView!: BMCollectionView;
	
	/**
	 * The callbacks to execute when this window closes.
	 */
	private _windowDidCloseCallbacks!: (() => void)[];
	
	/**
	 * A dictionary containing the registered observers for each property.
	 */
    private _propertyObservers!: Dictionary<((any) => void)[]>;
    
    /**
     * The jQuery element representing this window's content.
     */
	private _content!: $;
	
	/**
	 * Set to `YES` if this window is in mini mode.
	 */
	private isMini: boolean = NO;
	
	/**
	 * Must be invoked after creation to initialize this widget configuration window.
	 * @param URL <String>						The URL to the configuration contents.
	 * {
	 *	@param widget <TWWidget>				The widget managed by this configuration window.
	 *	@param sections <[String]>				The array of navigation sections.
	 *	@param frame <BMRect>					The window's frame.
	 *  @param completionHandler <void ^()>		A handler that will be invoked when the contents have been loaded.
	 * }
	 * @return <BMWidgetConfigurationWindow>	This configuration window.
	 */
	initWithURL(URL: string, args: {widget: TWComposerWidget, sections: {name: string, label: string}[], frame: BMRect, completionHandler: () => void}): this {
		// Run the super constructor
		BMWindow.prototype.initWithFrame.call(this, args.frame, {toolbar: YES, modal: NO});
		
		// Prepare the property observer object
		this._propertyObservers = {};
		
		this.delegate = this;
		
		this._widget = args.widget;
		this._sections = args.sections;
		
		this._windowDidCloseCallbacks = [];
		
		var self = this;
		
		var sidebarClass = (('backdropFilter' in document.body.style) || ('webkitBackdropFilter' in document.body.style)) ? '' : ' BMWidgetConfigurationWindowNavigationSidebarCompatibility';
		
		this.content.innerHTML = '<div class="BMWidgetConfigurationWindowContent"></div><div class="BMWidgetConfigurationWindowNavigationSidebar' + sidebarClass + '"></div>';
		
		var windowContent = $(this.content.querySelectorAll('.BMWidgetConfigurationWindowContent'));
		
		self._createCollectionView();

		if (args.frame.size.width <= 960) {
			this.isMini = YES;
			(this as any).node.classList.add('BMWidgetConfigurationWindowMini');
			(this._groupCollectionView.layout as BMCollectionViewTableLayout).rowHeight = 24;
		}
		
		// Minimize button
		this.createToolbarButtonWithClass('BMWidgetConfigurationWindowMinimizeButton', {content: '<i class="material-icons">remove</i>', action: (event: KeyboardEvent) => {
			if (event.altKey) {
				BMWindow.minimizeAllAnimated(YES);
			}
			else {
				this.minimizeAnimated(YES);
			}
		}});
		
		// Close button
		self.createToolbarButtonWithClass('BMWidgetConfigurationWindowCloseButton', {content: '<i class="material-icons">&#xE5CD;</i>', action: () => {
			this.dismissAnimated(YES, {toNode: this.delegate!.DOMNodeForDismissedWindow!(this)});
		}});
		
		// Execute a GET to obtain the window contents
		var request = new XMLHttpRequest();
		request.open('GET', URL, YES);
		request.onload = function () {
			if (request.status === 200) {
				self._content = $(request.responseText);
				// Add the window contents to the window
				windowContent.append(self._content);
				
				// Find all entity pickers and create their magic pickers
				var entityPickers = windowContent.find('[data-entity="YES"]');
				entityPickers.each(function () {
					var pickerElement = $(this);
					
					// Get the corresponding widget property name
					var propertyName = pickerElement.data('property');
					
					// Find all other entity pickers that also handle this property
					var otherPickerElements = windowContent.find('[data-property="' + propertyName + '"]')
					
					// Construct the magic picker
					try {
                        // There is no definition for twMagicPicker
						(pickerElement as any).twMagicPicker({
			                editMode: true,
							entityType: pickerElement.data('entityType'),
							entityName: self._widget.getProperty(propertyName),
			                singleEntityChanged: function (entity){
				                self._widget.setProperty(propertyName, entity.entityName);
								//self._notifyObserversForProperty(propertyName);
				                
				                // TODO Handle other entity pickers for the same property
			                },
				            singleEntityRemoved: function () {
					            self._widget.setProperty(propertyName, undefined);
								//self._notifyObserversForProperty(propertyName);
				                
				                // TODO Handle other entity pickers for the same property
							}
						});
						
						// In certain versions of thingworx, the magic picker popover has a Z index value that makes it appear
						// behind the configuration window so it is manually correct to be the window's Z index + 1
						pickerElement.find('.twInlineSearch').data().twInlineSearch.inlineResults[0].style.zIndex = BMWindow.zIndexMax() + 1;
			        }
			        catch (e) {
				        
			        }
			        
			        self.registerWindowDidCloseCallback(function () {
                        // There is no definition for twMagicPicker
				        (pickerElement as any).twMagicPicker('destroy');
			        });
				});

				// When using Core UI widgets, the image sources will be changed
				// TODO: In the future this should be handled by the build system instead of at runtime
				Array.from(windowContent[0].querySelectorAll('img')).forEach(img => {
					const sourceComponents = img.src.split('/');

					img.src = `../Common/extensions/CollectionView/ui/BMCollectionView/static/assets/${sourceComponents[sourceComponents.length - 1]}`;
				});
				
				// Find all primitive editors and set up their event handlers
				var primitiveEditors: $ = windowContent.find('[data-primitive="YES"]');
				primitiveEditors.each(function () {
					var primitiveEditor = $(this);
					
					// Get the corresponding widget property name
					var propertyName: string = primitiveEditor.data('property');
					
					// Obtain a reference to all other inputs that also handle this property
					var otherPrimitiveEditors: $ = windowContent.find('[data-property="' + propertyName + '"]').not(primitiveEditor);
					
					// A value filter is created for properties that need to be converted to a different type than provided by their input element
					var primitiveType: string = primitiveEditor.data('primitiveType');
					if (primitiveType == 'Int') {
						var valueByConvertingValue = function (value: any): any {
							return parseInt(value, 10);
						};
					}
					else {
						// If type conversion isn't required, the value filter will simply return the supplied value
						var valueByConvertingValue = function (value: any): any {
							return value;
						};
					}
					
					// Populate the input with the property's current value from the widget
					primitiveEditor.val(self._widget.getProperty(propertyName));
					
					// Check if this property is a single binding
					if (primitiveEditor.data('single-binding') == "YES") {
						// If it is, set up the completion drop-down
						var sourceProperty = primitiveEditor.data('source-property');
						var sourcePropertyFields: string[] = [];
						
						// Load the fields
						BMWidgetConfigurationWindowGetBindingFieldsForProperty(sourceProperty, {widget: self._widget, intoArray: sourcePropertyFields});
						
						var observer = () => {
							sourcePropertyFields.length = 0;
							BMWidgetConfigurationWindowGetBindingFieldsForProperty(sourceProperty, {widget: self._widget, intoArray: sourcePropertyFields});
						}
						
						// Register an observer that reloads the fields when the source property is updated
						self.registerObserver(observer, {forProperty: sourceProperty});

						const textField = BMTextField.textFieldForInputNode(primitiveEditor[0]);
						textField.delegate = {
							textFieldShouldAutocompleteText() {
								return YES;
							},

							textFieldShouldShowSuggestions() {
								return YES;
							},

							textFieldSuggestionsForText(field, text) {
								return sourcePropertyFields;
							},

							textFieldContentsDidChange(field) {
								self._widget.setProperty(propertyName, valueByConvertingValue(primitiveEditor.val()));
								//self._notifyObserversForProperty(propertyName);
								
								// Update the other primitive editors to the new value
								otherPrimitiveEditors.val(primitiveEditor.val()!);
							}
						};

						textField.maxSuggestions = 20;
						
						self.registerWindowDidCloseCallback(function () {
							textField.release();
						});
					}
					else {
					
						// Set up the input event handler to update the property
						primitiveEditor.on('input', function () {
							self._widget.setProperty(propertyName, valueByConvertingValue(primitiveEditor.val()));
							//self._notifyObserversForProperty(propertyName);
							
							// Update the other primitive editors to the new value
							otherPrimitiveEditors.val(primitiveEditor.val()!);
						});
					}
				});
				
				// Find all toggle editors and set up their event handlers
				var toggles: JQuery<HTMLInputElement> = windowContent.find('[data-toggle="YES"]') as JQuery<HTMLInputElement>;
				toggles.each(function () {
					var toggle: JQuery<HTMLInputElement> = $(this) as JQuery<HTMLInputElement>;
					
					// Get the corresponding widget property name
					var propertyName: string = toggle.data('property');
					
					// Find all other toggle that also handle this property
					var otherToggles: JQuery<HTMLInputElement> = windowContent.find('[data-property="' + propertyName + '"]').not(toggle) as JQuery<HTMLInputElement>;
					
					// Set the checkbox state to the property's current value from the widget
					toggle[0].checked = self._widget.getProperty(propertyName);
					
					// Set up the change handler to update the property
					toggle.on('change', function () {
						self._widget.setProperty(propertyName, toggle[0].checked);
						//self._notifyObserversForProperty(propertyName);
						
						// Update the other toggles
						otherToggles.prop('checked', toggle[0].checked);
					});
				});
				
				// Find all choice editors and set up their event handlers
				var choices: $ = windowContent.find('[data-choice="YES"]');
				choices.each(function () {
					var choice: $ = $(this);
					
					// Get the corresponding widget property name
					var propertyName: string = choice.data('property');
					
					// At this time, there are no multiple choice editors for the same property, so synchronization is not needed here
					
					// Set up the state to the property's current value from the widget
					var currentValue: string = self._widget.getProperty(propertyName);
					choice.find('[data-value="' + currentValue + '"]').addClass('BMCollectionViewVerticalTableEntryChoiceSelected');
					
					// Set up the click handler to update the property
					choice.find('.BMCollectionViewVerticalTableEntryChoice').on('click', function (event) {
						var selectedChoice = $(this).closest('.BMCollectionViewVerticalTableEntryChoice');
						
						// Get the internal value for the current choice
						var value = selectedChoice.data('value');
						self._widget.setProperty(propertyName, value);
						//self._notifyObserversForProperty(propertyName);
						
						// Update the UI accordingly
						choice.find('.BMCollectionViewVerticalTableEntryChoiceSelected').removeClass('BMCollectionViewVerticalTableEntryChoiceSelected');
						selectedChoice.addClass('BMCollectionViewVerticalTableEntryChoiceSelected');
					});
				});
				
				// Find all double bindings and set up their contents and event handlers
				// Double bindings are a special case of string properties, whose contents is a JSON
				// object having keys as binding sources and values as binding targets
				var doubleBindings: $ = windowContent.find('[data-double-binding="YES"]');
				doubleBindings.each(function () {
					// NOTE: because they are only updated when the configuration window closes, double binding properties currently do not support notifying observers
					
					var doubleBinding = $(this);
					
					// Get the source and target property names
					var sourceProperty = doubleBinding.data('source-property');
					var targetProperty = doubleBinding.data('target-property');
					
					// Get the binding property name and current value
					var propertyName = doubleBinding.data('property');
					var currentBindings;
					try {
						currentBindings = JSON.parse(self._widget.getProperty(propertyName)) || {};
					}
					catch (error) {
						currentBindings = {};
					}
					
					var sourcePropertyFields = [];
					var targetPropertyFields = [];
					
					// Load the fields
					BMWidgetConfigurationWindowGetBindingFieldsForProperty(sourceProperty, {widget: self._widget, intoArray: sourcePropertyFields});
					BMWidgetConfigurationWindowGetBindingFieldsForProperty(targetProperty, {widget: self._widget, intoArray: targetPropertyFields});
						
					function sourceObserver() {
						sourcePropertyFields.length = 0;
						BMWidgetConfigurationWindowGetBindingFieldsForProperty(sourceProperty, {widget: self._widget, intoArray: sourcePropertyFields});
					}
						
					function targetObserver() {
						targetPropertyFields.length = 0;
						BMWidgetConfigurationWindowGetBindingFieldsForProperty(targetProperty, {widget: self._widget, intoArray: targetPropertyFields});
					}
					
					// Register observerd that reload the fields when the source or target properties ar updated
					self.registerObserver(sourceObserver, {forProperty: sourceProperty});
					self.registerObserver(targetObserver, {forProperty: targetProperty});
					
					// Populate the table
					var table = $('<div class="BMCollectionViewConfigurationDoubleBindingTable"></div>');
					
					
					// The binding model is the JSON object describing this double binding
					// Internally, is modelled as an array of objects and is transformed to the
					// required JSON format when saving this property
					var bindingModel: any[] = [];
					
					/**
					 * Adds a binding.
					 * @param binding <Object>					The binding to add.
					 * {
					 *	@param animated <Boolean, nullable>		Defaults to NO. If set to YES, this change will be animated, otherwise it will be instant.
					 * }
					 */
					function BMWidgetConfigurationWindowDoubleBindingAddBinding(binding: any, args?: {animated?: boolean}) {
						// Add the binding to the binding model
						bindingModel.push(binding);
						
						var animated = args && args.animated;
						
						// Create the HTML representation
						var row = $('<div class="BMCollectionViewConfigurationDoubleBindingRow">\
										<input class="BMCollectionViewVerticalTablePropertyListValue BMCollectionViewConfigurationDoubleBindingKey" value="' + binding.key + '"/>\
										<div class="BMCollectionViewConfigurationDoubleBindingArrow"></div>\
										<input class="BMCollectionViewVerticalTablePropertyListValue BMCollectionViewConfigurationDoubleBindingValue" value = "' + binding.value + '"/>\
										<div class="BMCollectionViewConfigurationDoubleBindingDeleteButton">&times;</div>\
									</div>');

						const keyTextField = BMTextField.textFieldForInputNode(row.find('.BMCollectionViewConfigurationDoubleBindingKey')[0]);
						keyTextField.delegate = {
							textFieldShouldAutocompleteText() {
								return YES;
							},

							textFieldShouldShowSuggestions() {
								return YES;
							},

							textFieldSuggestionsForText(field, text) {
								return sourcePropertyFields;
							},

							textFieldContentsDidChange(field) {
								binding.key = (field.node as HTMLInputElement).value;
							}
						};

						keyTextField.maxSuggestions = 20;

						const valueTextField = BMTextField.textFieldForInputNode(row.find('.BMCollectionViewConfigurationDoubleBindingValue')[0]);
						valueTextField.delegate = {
							textFieldShouldAutocompleteText() {
								return YES;
							},

							textFieldShouldShowSuggestions() {
								return YES;
							},

							textFieldSuggestionsForText(field, text) {
								return targetPropertyFields;
							},

							textFieldContentsDidChange(field) {
								binding.value = (field.node as HTMLInputElement).value;
							}
						};

						valueTextField.maxSuggestions = 20;
									
						row.find('.BMCollectionViewConfigurationDoubleBindingDeleteButton').on('click', function (event) {
							BMWidgetConfigurationWindowDoubleBindingRemoveBinding(binding, {animated: YES});
						});
									
						if (animated) {
							BMHook(row, {height: 0, opacity: 0});
						}
									
						addBindingButton.before(row);
						
						// Animate as needed
						if (animated) {
							row.velocity({height: '48px', opacity: 1}, {easing: 'easeInOutQuart', duration: 300});
						}
						
						// Retain a reference to the HTML element for this binding
						binding.row = row;
						binding.keyField = keyTextField;
						binding.valueField = valueTextField;
					}
						
					// Update the property when the window closes
					self.registerWindowDidCloseCallback(function () {
						var bindings = {};
						
						bindingModel.forEach(function (binding) {
							if (binding.key && binding.value) {
								bindings[binding.key] = binding.value;
							}

							binding.keyField.release();
							binding.valueField.release();
						});
						
						self._widget.setProperty(propertyName, JSON.stringify(bindings));
					});
					
					/**
					 * Removes a binding.
					 * @param binding <Object>					The binding to remove.
					 * {
					 *	@param animated <Boolean, nullable>		Defaults to NO. If set to YES, this change will be animated, otherwise it will be instant.
					 * }
					 */
					function BMWidgetConfigurationWindowDoubleBindingRemoveBinding(binding, args) {
						// Remove the binding from the model
						bindingModel.splice(bindingModel.indexOf(binding), 1);
						
						var animated = args && args.animated;
						
						// Retrieve the associated HTML element
						var row = binding.row;
						
						// Animate as needed
						if (animated) {
							row.css({pointerEvents: 'none'});
							row.velocity({height: '0px', opacity: 0}, {easing: 'easeInOutQuart', duration: 300, complete: function () {
								row.keyField.release();
								row.valueField.release();
								row.remove();
							}});
						}
						else {
							row.keyField.release();
							row.valueField.release();
							row.remove();
						}
					}
					
					// Set up the button used to add new bindings
					var addBindingButton = $('<div class="BMCollectionViewConfigurationButton">Add Binding</div>');
					addBindingButton.on('click', function () {
						BMWidgetConfigurationWindowDoubleBindingAddBinding({key: '', value: ''}, {animated: YES});
					});
					
					table.append(addBindingButton);
					
					// Create the already set bindings
					Object.keys(currentBindings).forEach(function (key) {
						BMWidgetConfigurationWindowDoubleBindingAddBinding({key: key, value: currentBindings[key]});
					});
					
					doubleBinding.append(table);
					
					
				});

				// Find all arrays and set up their contents and event handlers
				// Arrays are a special case of string properties, whose contents is a JSON array of strings
				const arrays: $ = windowContent.find('[data-array="YES"]');
				arrays.each(function () {
					// NOTE: because they are only updated when the configuration window closes, double binding properties currently do not support notifying observers
					
					const array = $(this);
					
					// Get the source property name
					var sourceProperty = array.data('source-property');
					
					// Get the binding property name and current value
					var propertyName = array.data('property');
					var currentArray;
					try {
						currentArray = JSON.parse(self._widget.getProperty(propertyName)) || [];
					}
					catch (error) {
						currentArray = [];
					}
					
					var sourcePropertyFields = [];
					
					// Load the fields
					BMWidgetConfigurationWindowGetBindingFieldsForProperty(sourceProperty, {widget: self._widget, intoArray: sourcePropertyFields});
						
					function sourceObserver() {
						sourcePropertyFields.length = 0;
						BMWidgetConfigurationWindowGetBindingFieldsForProperty(sourceProperty, {widget: self._widget, intoArray: sourcePropertyFields});
					}
					
					// Register observerd that reload the fields when the source or target properties ar updated
					self.registerObserver(sourceObserver, {forProperty: sourceProperty});
					
					// Populate the table
					var table = $('<div class="BMCollectionViewConfigurationDoubleBindingTable"></div>');
					
					
					// The array model is the JSON object describing this array
					// Internally, is modelled as an array of objects and is transformed to the
					// required JSON format when saving this property
					var arrayModel: any[] = [];
					
					/**
					 * Adds an item.
					 * @param item <Object>						The item to add.
					 * {
					 *	@param animated <Boolean, nullable>		Defaults to NO. If set to YES, this change will be animated, otherwise it will be instant.
					 * }
					 */
					function BMWidgetConfigurationWindowArrayAddItem(item: any, args?: {animated?: boolean}) {
						// Add the binding to the binding model
						arrayModel.push(item);
						
						var animated = args && args.animated;
						
						// Create the HTML representation
						var row = $('<div class="BMCollectionViewConfigurationDoubleBindingRow">\
										<input class="BMCollectionViewVerticalTablePropertyListValue BMCollectionViewConfigurationDoubleBindingValue" value = "' + item.value + '"/>\
										<div class="BMCollectionViewConfigurationDoubleBindingDeleteButton">&times;</div>\
									</div>');

						const valueTextField = BMTextField.textFieldForInputNode(row.find('.BMCollectionViewConfigurationDoubleBindingValue')[0]);
						valueTextField.delegate = {
							textFieldShouldAutocompleteText() {
								return YES;
							},

							textFieldShouldShowSuggestions() {
								return YES;
							},

							textFieldSuggestionsForText(field, text) {
								return sourcePropertyFields;
							},

							textFieldContentsDidChange(field) {
								item.value = (field.node as HTMLInputElement).value;
							}
						};

						valueTextField.maxSuggestions = 20;
									
						row.find('.BMCollectionViewConfigurationDoubleBindingDeleteButton').on('click', function (event) {
							BMWidgetConfigurationWindowArrayRemoveItem(item, {animated: YES});
						});
									
						if (animated) {
							BMHook(row, {height: 0, opacity: 0});
						}
									
						addItemButton.before(row);
						
						// Animate as needed
						if (animated) {
							row.velocity({height: '48px', opacity: 1}, {easing: 'easeInOutQuart', duration: 300});
						}
						
						// Retain a reference to the HTML element for this binding
						item.row = row;
						item.valueField = valueTextField;
					}
						
					// Update the property when the window closes
					self.registerWindowDidCloseCallback(function () {
						var array: string[] = [];
						
						arrayModel.forEach(function (item) {
							if (item.value) {
								array.push(item.value);
							}

							item.valueField.release();
						});
						
						self._widget.setProperty(propertyName, JSON.stringify(array));
					});
					
					/**
					 * Removes an itemg.
					 * @param item <Object>						The item to remove.
					 * {
					 *	@param animated <Boolean, nullable>		Defaults to NO. If set to YES, this change will be animated, otherwise it will be instant.
					 * }
					 */
					function BMWidgetConfigurationWindowArrayRemoveItem(item, args) {
						// Remove the item from the model
						arrayModel.splice(arrayModel.indexOf(item), 1);
						
						var animated = args && args.animated;
						
						// Retrieve the associated HTML element
						var row = item.row;
						
						// Animate as needed
						if (animated) {
							row.css({pointerEvents: 'none'});
							row.velocity({height: '0px', opacity: 0}, {easing: 'easeInOutQuart', duration: 300, complete: function () {
								row.valueField.release();
								row.remove();
							}});
						}
						else {
							row.valueField.release();
							row.remove();
						}
					}
					
					// Set up the button used to add new items
					var addItemButton = $('<div class="BMCollectionViewConfigurationButton">Add Item</div>');
					addItemButton.on('click', function () {
						BMWidgetConfigurationWindowArrayAddItem({value: ''}, {animated: YES});
					});
					
					table.append(addItemButton);
					
					// Create the already set items
					currentArray.forEach(function (value) {
						BMWidgetConfigurationWindowArrayAddItem({value});
					});
					
					array.append(table);
					
					
				});
				
				args.completionHandler();
			}
		};
		
		request.send();
		
		return this;
	};
	
	/**
	 * Invoked to create the collection view elements for this configuration window.
	 */
	_createCollectionView(): void {
		var self = this;
		
		// Create the groups collection view
		this._groupCollectionView = BMCollectionView.collectionViewForNode(this.content.querySelectorAll('.BMWidgetConfigurationWindowNavigationSidebar')[0] as HTMLElement);
		
		// Set up its layout
		this._groupCollectionView.layout = new BMCollectionViewTableLayout();
		(this._groupCollectionView.layout as BMCollectionViewTableLayout).sectionInsets = BMInsetMake(0, 64, 0, 22);
		
		var sectionKeys = this._sections;
		
		var windowContent = $(this.content.querySelectorAll('.BMWidgetConfigurationWindowContent'));
		
		// Construct its data set
		this._groupCollectionView.dataSet = {
			numberOfSections: function () { return 1; },
			numberOfObjectsInSectionAtIndex: function () { return sectionKeys.length; },
			indexPathForObjectAtRow: function (row, options) {
				return BMIndexPathMakeWithRow(row, {section: 1, forObject: sectionKeys[row]});
			},
			indexPathForObject: function (object) {
				for (var i = 0; i < sectionKeys.length; i++) {
					if (sectionKeys[i] === object) return BMIndexPathMakeWithRow(i, {section: 1, forObject: object});
				}
				return BMIndexPathNone;
			},
			contentsForCellWithReuseIdentifier: function (identifier) {
				return $('<div class="BMWidgetConfigurationWindowNavigationSidebarLink"></div>');
			},
			cellForItemAtIndexPath: function (indexPath) {
				var cell = self._groupCollectionView.dequeueCellForReuseIdentifier('link');
				
				// Style the cell based on whether it's selected or not
				if (self._groupCollectionView.isCellAtIndexPathSelected(indexPath)) {
					$(cell.node).find('.BMWidgetConfigurationWindowNavigationSidebarLink').addClass('BMWidgetConfigurationWindowNavigationSidebarLinkSelected');
				}
				else {
					$(cell.node).find('.BMWidgetConfigurationWindowNavigationSidebarLink').removeClass('BMWidgetConfigurationWindowNavigationSidebarLinkSelected');
				}
				
				// Update the cell's contents
				var object = indexPath.object as any;
				
				$(cell.node).find('.BMWidgetConfigurationWindowNavigationSidebarLink').text(object.label);
				
				return cell;
			},
			contentsForSupplementaryViewWithIdentifier: function (identifier) {
                // Supplementary views are not used, so it is not necessary to do anything in this method
                return $();
			},
			cellForSupplementaryViewWithIdentifier: function (identifier, options) {
                // Supplementary views are not used, so it is not necessary to do anything in this method
                return self._groupCollectionView.dequeueCellForSupplementaryViewWithIdentifier('');
			},
			updateCell: function (cell, options) {
				var object = options.atIndexPath.object as any;
				
				$(cell.node).find('.BMWidgetConfigurationNavigationSidebarLink').text(object.label);
			},
			updateSupplementaryView: function (view, options) {
				// Supplementary views are not used, so it is not necessary to do anything in this method
			},
			useOldData: function (use) {
				// This is never invoked as the data set never changes its contents
            },
            isUsingOldData: () => NO
		};
		
		// Select the first cell if available
		if (sectionKeys.length) {
			this._groupCollectionView.selectedIndexPaths = [BMIndexPathMakeWithRow(0, {section: 0, forObject: sectionKeys[0]})];
		}
		
		// Construct its delegate object
		this._groupCollectionView.delegate = {
			collectionViewDidSelectCellAtIndexPath: function (collectionView, indexPath) {
				// Clear all other selections
				collectionView.selectedIndexPaths = [indexPath];
				
				// Style the selected cell
				var cell = collectionView.cellAtIndexPath(indexPath, {ofType: BMCellAttributesType.Cell});
				if (cell) {
					$(cell.node).find('.BMWidgetConfigurationWindowNavigationSidebarLink').addClass('BMWidgetConfigurationWindowNavigationSidebarLinkSelected');
				}
				
				
				// Show the appropriate content in the window
				windowContent.find('.BMCollectionViewVerticalTableSelectedGroup').removeClass('BMCollectionViewVerticalTableSelectedGroup');
				windowContent.find('[data-group="' + (indexPath.object as any).name + '"]').addClass('BMCollectionViewVerticalTableSelectedGroup');
				
				// Scroll back to the top
				windowContent[0].scrollTop = 0;
			},
			
			collectionViewDidDeselectCellAtIndexPath: function (collectionView, indexPath) {
				// Style the deselected cell
				var cell = collectionView.cellAtIndexPath(indexPath, {ofType: BMCellAttributesType.Cell});
				if (cell) {
					$(cell.node).find('.BMWidgetConfigurationWindowNavigationSidebarLink').removeClass('BMWidgetConfigurationWindowNavigationSidebarLinkSelected');
				}
			},
			
			collectionViewShouldRunIntroAnimation: function (collectionView) {
				return NO;
			},
			
			collectionViewCanDeselectCellAtIndexPath: function (collectionView, indexPath) {
				// Do not allow the last cell to be deselected
				return collectionView.selectedIndexPaths.length > 1;
			}
		};
	};
	
	/**
	 * Should be invoked to register a callback that will execute when this configuration window closes.
	 * @param callback <void ^()>			The callback to execute.
	 */
	registerWindowDidCloseCallback(callback: () => void) {
		this._windowDidCloseCallbacks.push(callback);
	};
	
	/**
	 * Registers an observer that will be notified whenever the given property is modified by this widget configuration window.
	 * @param observer <void ^(AnyObject)>				The observer callback. This callback returns nothing and receives the property's new value as its parameter.
	 * {
	 *	@param forProperty <String>						The property to observe.
	 * }
	 */
	registerObserver(observer: (any) => void, args: {forProperty: string}) {
		var property = args.forProperty;
		
		if (!this._propertyObservers[property]) this._propertyObservers[property] = [];
		
		this._propertyObservers[property].push(observer);
	};
	
	/**
	 * Invoked internally when a property is updated and registered observers should be notified.
	 * @param property <String>							The property that was changed.
	 */
	_notifyObserversForProperty(property: string) {
		if (!this._propertyObservers[property]) return;
		
		var self = this;
		this._propertyObservers[property].forEach(function (observer) {
			observer(self._widget.getProperty(property));
		});
	};
	
	// @override - BMWindowDelegate
	windowDidClose() {
		// Run all registered callbacks
		this._windowDidCloseCallbacks.forEach(function (callback) {
			callback();
		});
		
		// Then release all resources
		this._groupCollectionView.release();
		this.release();
		
		// And udpate the widget properties sidebar
		this._widget.updatedProperties();
	}

	// @override - BMWindowDelegate
	windowDidResize() {
		if ((<any>this).frame.size.width > 960) {
			if (this.isMini) {
				this.isMini = NO;
				(this as any).node.classList.remove('BMWidgetConfigurationWindowMini');
				(this._groupCollectionView.layout as BMCollectionViewTableLayout).rowHeight = 44;
			}
		}
		else {
			if (!this.isMini) {
				this.isMini = YES;
				(this as any).node.classList.add('BMWidgetConfigurationWindowMini');
				(this._groupCollectionView.layout as BMCollectionViewTableLayout).rowHeight = 24;
			}
		}

		this._groupCollectionView.resized();
	}

	/**
	 * Constructs and returns a toolbar button DOM node. This node will not be added to the document automatically.
	 * @param className <String>			A list of class names that should be assigned to the button.
	 * {
	 * 	@param content <String>				The HTML content that this button should contain.
	 * 	@param action <void ^ (Event)>		An callback function that will be invoked whenever this button is clicked.
	 * 	@param tooltip <String, nullable>	If specified, this represent a tooltip text that appears when hovering over the button.
	 * }
	 * @return <DOMNode>					The button that was created.
	 */
	createToolbarButtonWithClass(className, args) {
		var button = document.createElement('div');
		button.className = 'BMWidgetConfigurationWindowToolbarButton ' + className;
		button.innerHTML = args.content;
		this.toolbar.appendChild(button);
		button.addEventListener('click', args.action);

		if (args.tooltip) {
			button.classList.add('BMHasTooltip');
			button.classList.add('BMTooltipPositionBottom');
			button.setAttribute('data-bm-tooltip', args.tooltip);
		}

		return button;
	}
	
}

/**
 * Asynchronously loads the mashup parameter definitions for the given mashup.
 * @param mashup <String>							The mashup for which to get the parameters.
 * {
 *	@param completionHandler <void ^(Object)>		The callback to invoke when the parameters are retrieved.
 *													This callback returns nothing and receives the parameter definitions as its only parameter.
 * }
 */
export function BMWidgetConfigurationWindowGetParametersForMashup(mashup: string, args: {completionHandler: (any) => void}) {
	if (!mashup) {
		args.completionHandler({});
		return;
	}
	
	var xhr = new XMLHttpRequest();
	xhr.open('GET', '/Thingworx/Mashups/' + mashup + '?Accept=application/json');
	
	xhr.onload = function () {
		if (xhr.status == 200) {
			try {
				var parameters = JSON.parse(xhr.response).parameterDefinitions;
				args.completionHandler(parameters);
			}
			catch (error) {
				args.completionHandler({});
			}
		}
		else {
			args.completionHandler({});
		}
	};

	xhr.onerror = () => args.completionHandler({});
	
	xhr.send();
}

/**
 * Loads the binding fields for the given property into the given array.
 * Depending on the type of property, this may happen asynchronously.
 * @param property <String>									The property for which to load the binding fields. If blank, an empty array will be supplied to the callback.
 * {
 *	@param widget <TWWidget>								The widget containing the given property.
 *	@param intoArray <[String]>								The array into which the binding fields will be added.
 *	@param completionHandler <void ^([String]), nullable>	An optional callback to invoke when the binding fields have been retrieved.
 *															This callback returns nothing and will receive the array of binding fields as its only parameter.
 * }
 */
export function BMWidgetConfigurationWindowGetBindingFieldsForProperty(property: string, args: {widget: TWComposerWidget, intoArray: string[], completionHandler?: (_: string[]) => void}) {
	var widget = args.widget;
	var array = args.intoArray;
	var callback = args.completionHandler;

	// An empty property name may be supplied, which causes an empty array to be returned.
	if (!property) {
		if (args.completionHandler) {
			args.completionHandler([]);
		}

		return;
	}

	// A special "__Widgets" may be specified to show the available widget display names
	if (property == '__Widgets') {
		const rootWidget = widget.jqElement.closest('#mashup-root').data('widget');
		const names = [rootWidget.getProperty('DisplayName')];
		
		let widgets = rootWidget.widgets.slice();
		while (widgets.length) {
			const widget = widgets.pop();
			names.push(widget.getProperty('DisplayName'));
			widgets = widgets.concat(widget.widgets);
		}

		array.push.apply(array, names);

		return args.completionHandler?.(array);
	}

	// A special "__DelegateKeys" may be specified to show the available delegate keys
	if (property == '__DelegateKeys') {
		array.push.apply(array, ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Space', 'Enter']);

		return args.completionHandler?.(array);
	}
	
	var properties = (widget.allWidgetProperties() as any).properties;
	
	switch (properties[property].baseType) {
		case 'INFOTABLE':
			// Infotables can be loaded synchronously if their data shape is defined statically
			var dataShape = widget.getSourceDatashapeName!(property) || widget.getInfotableMetadataForProperty(property);
			if (typeof dataShape == 'string') {
				// String data shapes need an asynchronous request to be resolved
				TW.IDE.GetDataShapeInfo(dataShape, function (dataShape) {
					if (dataShape) {
						array.push.apply(array, Object.keys(dataShape.fieldDefinitions || {}));
					}

					// Add the entire row entry
					array.unshift('@row');
					
					if (args.completionHandler) {
						args.completionHandler(array);
					}
				}, YES);
			}
			else {
				// Object data shapes may be resolved synchronously
				array.push.apply(array, Object.keys(dataShape || {}));

				// Add the entire row entry
				array.unshift('@row');
				
				if (args.completionHandler) {
					args.completionHandler(array);
				}
			}
		break;
		case 'MASHUPNAME':
			// Mashups need an asynchronous request to be resolved
			BMWidgetConfigurationWindowGetParametersForMashup(widget.getProperty(property), {completionHandler: function (definitions) {
				array.push.apply(array, Object.keys(definitions));
				
				if (args.completionHandler) {
					args.completionHandler(array);
				}
			}});
		break;
	}
};

// #endregion

/**
 * An extension to widget properties containing the additional fields used by Collection View.
 */
export interface BMCollectionViewWidgetProperties extends TWWidgetProperties {

	properties: Dictionary<BMCollectionViewWidgetProperty>;
	
	isVisible?: boolean;
}

/**
 * An extension to widget properties containing the additional fields used by Collection View.
 */
export interface BMCollectionViewWidgetProperty extends TWWidgetProperty {
    /**
     * Reserved for future use.
     */
    _BMSection?: string,

    /**
     * Reserved for future use.
     */
    _BMFriendlyName?: string,

    /**
     * An array of categories to which this property belongs.
     * This is used when filtering the list of properties via the `Show` property.
     */
    _BMCategories: string[],

    /**
     * Should be set to `NO` when this property is not a built-in property but an
     * automatically generated property.
     */
    isBaseProperty?: boolean,

    /**
     * The name of the property.
     */
    name?: string;
}

/**
 * An extension to widget services containing the additional fields used by Collection View.
 */
export interface BMCollectionViewWidgetService extends TWWidgetService {
    /**
     * An array of categories to which this service belongs.
     * This is used when filtering the list of properties via the `Show` property.
     */
    _BMCategories?: string[],

    /**
     * Should be set to `NO` when this property is not a built-in property but an
     * automatically generated property.
     */
    isBaseProperty?: boolean
}

/**
 * An extension to widget services containing the additional fields used by Collection View.
 */
export interface BMCollectionViewWidgetEvent extends TWWidgetEvent {
    /**
     * An array of categories to which this event belongs.
     * This is used when filtering the list of properties via the `Show` property.
     */
    _BMCategories?: string[],

    /**
     * Should be set to `NO` when this property is not a built-in property but an
     * automatically generated property.
     */
    isBaseProperty?: boolean
}

/**
 * A dictionary that describes the mapping between collection view property names
 * and their corresponding collection property names.
 */
const BMCollectionViewDowngradePropertyMap = {
	CanSelectCells: 'AllowSelection',
	AlwaysUseCustomScrollerOniOS: 'AlwaysUseCustomScrollerOniOS',
	AutoSelectsFirstCell: 'AutoSelectFirstRow',
	FlowLayoutBottomPadding: 'BottomPadding',
	CellStyleActive: 'CellActiveStyle',
	CellBorderRadius: 'CellBorderRadius',
	CellBoxShadow: 'CellBoxShadow',
	CellStyleHover: 'CellStyleHover',
	CellMashupSelectedField: 'CellMashupSelectedField',
	CellSlideMenuIconGravity: 'CellMenuStatesIconGravity',
	CellSlideMenuIconSize: 'CellMenuStatesIconSize',
	CellSlideMenuOrientation: 'CellMenuStatesOrientation',
	CellSlideMenuUseBuiltin: 'CellMenuStatesUseBuiltin',
	CellMultipleSelectionType: 'CellMultipleSelectionType',
	CellPointer: 'CellPointer',
	CellStyleSelected: 'CellSelectedStyle',
	CellStyle: 'CellStyle',
	DisplayName: 'DisplayName',
	FlowLayoutAlignment: 'FlowLayoutAlignment',
	FlowLayoutContentGravity: 'FlowLayoutContentGravity',
	FlowLayoutGravity: 'FlowLayoutGravity',
	FooterHeight: 'FooterHeight',
	FooterMashupSectionProperty: 'FooterSectionParam',
	HasSelectedCells: 'HasSelectedCells',
	HeaderHeight: 'HeaderHeight',
	HeaderMashupSectionProperty: 'HeaderSectionParam',
	Height: 'Height',
	Id: 'Id',
	LastContainer: 'LastContainer',
	Left: 'Left',
	FlowLayoutLeftAlignFinalRow: 'LeftAlignFinalRow',
	CellMashupGlobalPropertyBinding: 'MashupGlobalPropertyBinding',
	CellHeight: 'MashupHeight',
	CellMashupPropertyBinding: 'MashupPropertyBinding',
	CellWidth: 'MashupWidth',
	FlowLayoutMinimumSpacing: 'MinimumSpacing',
	OffScreenBufferFactor: 'OffScreenBufferFactor',
	PlaysIntroAnimation: 'PlaysIntroAnimation',
	ResponsiveLayout: 'ResponsiveLayout',
	RippleStyle: 'RippleEffectStyle',
	FlowLayoutRowSpacing: 'FlowLayoutRowSpacing',
	ScrollsToSelectedCell: 'ScrollsToSelectedCell',
	SectionInsetBottom: 'SectionInsetBottom',
	SectionInsetLeft: 'SectionInsetLeft',
	SectionInsetRight: 'SectionInsetRight',
	SectionInsetTop: 'SectionInsetTop',
	SelectedCellsCount: 'SelectedCellsCount',
	ShowDataLoading: 'ShowDataLoading',
	ShowsFooters: 'ShowFooters',
	ShowsHeaders: 'ShowHeaders',
	SortAscending: 'SortAscending',
	Top: 'Top',
	FlowLayoutTopPadding: 'TopPadding',
	UseCustomScrollerOnWindowsDesktops: 'UseCustomScrollerOnWindowsDesktops',
	CellMashupHasIntrinsicSize: 'UseMashupDimensions',
	UsesRipple: 'UseRippleEfect',
	Layout: 'View',
	Visible: 'Visible',
	Width: 'Width',
	'Z-index': 'Z-index',

	UIDField: 'UIDField',
	SortField: 'SortField',
	SectionField: 'SectionField',
	CustomClass: 'CustomClass',
	CellMashupName: 'Mashup',
	CellMashupNameSelected: 'MashupNameSelected',

	CellWidthField: 'CellWidthField',
	CellHeightField: 'CellHeightField',
	CellMashupNameField: 'MashupNameField',

	EmptyMashupName: 'EmptyMashupName',

	_EventDataShape: '_EventDataShape',
	_MenuDefinition: '_MenuDefinition',
	_GlobalDataShape: '_GlobalDataShape'

}

/**
 * A dictionary that contains properties that collection supports but are not available in
 * collection view.
 */
const BMCollectionViewDowngradeStaticFields = {
	Type: 'collection',
	__TypeDisplayName: 'Collection',
	ScrollbarType: 'hover',
	ItemLoadBehavior: 'loadUnload',
}

// #region BMCollectionViewWidget

@TWNamedComposerWidget("BMCollectionView")
export class BMCollectionViewWidget extends TWComposerWidget 
implements BMCollectionViewDelegate, BMCollectionViewDataSet, BMCollectionViewDelegateTableLayout, BMCollectionViewDelegateFlowLayout, BMCollectionViewDelegateMasonryLayout {

    collectionView!: BMCollectionView;

    // #region BMCollectionViewDataSet
    	
	numberOfSections(): number {
		return 3;
	}
	
	numberOfObjectsInSectionAtIndex(index: number): number {
		return 15;
	}
	
	contentsForCellWithReuseIdentifier(identifier: string): $ | string {
		return 'Cell';
	}
	
	contentsForSupplementaryViewWithIdentifier(identifier: string): $ | string {
		return identifier;	
	}
	
	cellForItemAtIndexPath(indexPath: BMIndexPath): BMCollectionViewCell {
		var cell = this.collectionView.dequeueCellForReuseIdentifier('PreviewCell');
		
		if (!(cell as any).initialized) {
			(cell as any).initialized = YES;
			
			cell.node.classList.add('BMCollectionViewPreviewCell');
		}
		
		return cell;
	};
	
	cellForSupplementaryViewWithIdentifier(identifier: string, args: {atIndexPath: BMIndexPath}): BMCollectionViewCell {
		var cell = this.collectionView.dequeueCellForSupplementaryViewWithIdentifier(identifier);
		
		if (!(cell as any).initialized) {
			(cell as any).initialized = YES;
			
			cell.node.classList.add('BMCollectionViewPreviewCell');
		}
		
		return cell;
	}
	
	indexPathForObjectAtRow(row: number, args: {inSectionAtIndex: number}) {
		return BMIndexPathMakeWithRow(row, {section: args.inSectionAtIndex, forObject: row + 15 * args.inSectionAtIndex});
    }
    
    indexPathForObject(object: number): BMIndexPath {
        let section = object % 15;
        let row = object - section * 15;

        return BMIndexPathMakeWithRow(row, {section: section, forObject: object});
    }

    useOldData() {};
    isUsingOldData(): boolean {
        return NO;
    }

    // #endregion

    // #region BMCollectionViewDelegate
	
	collectionViewShouldRunIntroAnimation(): boolean {
		return NO;
    }

	collectionViewSizeForCellAtIndexPath(collectionView: BMCollectionView, indexPath: BMIndexPath): BMSize {
		return BMSizeMake(this.getProperty('CellWidth'), this.getProperty('CellHeight'));
	}
	
	collectionViewHeightForCellAtIndexPath(collectionView: BMCollectionView, indexPath: BMIndexPath, options: {forColumnWidth: number}): number {
		return this.getProperty('CellHeight');
    }
    
    collectionViewRowHeightForCellAtIndexPath(collection: BMCollectionView, indexPath: BMIndexPath): number {
        return this.getProperty('CellHeight');
    }
    
    // #endregion

    // #region Layout Generators

	/**
	 * Constructs and configures a flow layout based on this widget's property vlaues.
	 * @return <BMCollectionViewFlowLayout>		A flow layout.
	 */
	createFlowLayout(): BMCollectionViewFlowLayout {
		var layout = new BMCollectionViewFlowLayout();
		layout.orientation = BMCollectionViewFlowLayoutOrientation[this.getProperty('FlowLayoutOrientation', 'Vertical')];
		layout.rowSpacing = this.getProperty('FlowLayoutRowSpacing');
		layout.minimumSpacing = this.getProperty('FlowLayoutMinimumSpacing');
		layout.cellSize = BMSizeMake(this.getProperty('CellWidth'), this.getProperty('CellHeight'));
		layout.gravity = BMCollectionViewFlowLayoutGravity[this.getProperty('FlowLayoutGravity')];
		layout.leftAlignFinalRow = this.getProperty('FlowLayoutLeftAlignFinalRow');
		
		layout.topPadding = this.getProperty('FlowLayoutTopPadding');
		layout.bottomPadding = this.getProperty('FlowLayoutBottomPadding');

		layout.contentGravity = BMCollectionViewFlowLayoutAlignment[this.getProperty('FlowLayoutContentGravity')];
		(layout as any).maximumCellsPerRow = this.getProperty('FlowLayoutMaximumCellsPerRow');
		
		if (this.getProperty('SectionField')) {
		
			layout.showsHeaders = this.getProperty('ShowsHeaders');
			layout.headerHeight = this.getProperty('HeaderHeight');
			
			layout.showsFooters = this.getProperty('ShowsFooters');
			layout.footerHeight = this.getProperty('FooterHeight');
			
			layout.pinsHeadersToContentEdge = this.getProperty('FlowLayoutPinsHeadersToContentEdge', NO);
			layout.pinsFootersToContentEdge = this.getProperty('FlowLayoutPinsFootersToContentEdge', NO);
			
		}
			
		layout.sectionInsets = BMInsetMake(this.getProperty('SectionInsetLeft') | 0, 
											this.getProperty('SectionInsetTop') | 0, 
											this.getProperty('SectionInsetRight') | 0, 
											this.getProperty('SectionInsetBottom') | 0
		);
		
		return layout;
	};
	
	/**
	 * Constructs and configures a masonry layout based on this widget's property vlaues.
	 * @return <BMCollectionViewMasonryLayout>		A masonry layout.
	 */
	createMasonryLayout(): BMCollectionViewMasonryLayout {
		var layout = new BMCollectionViewMasonryLayout();
		
		var speeds = this.getProperty('MasonryLayoutColumnSpeeds').split(',');
		
		for (var i = 0; i < speeds.length; i++) {
			speeds[i] = parseFloat(speeds[i].trim());
		}
		
		layout.columnSpeeds = speeds;
		layout.numberOfColumns = this.getProperty('MasonryLayoutNumberOfColumns');
		layout.minimumColumnWidth = this.getProperty('MasonryLayoutColumnWidth');
		layout.columnSpacing = this.getProperty('MasonryLayoutColumnSpacing');
		layout.cellSpacing = this.getProperty('MasonryLayoutCellSpacing');
		
		layout.topPadding = this.getProperty('MasonryLayoutTopPadding');
		layout.bottomPadding = this.getProperty('MasonryLayoutBottomPadding');
		
		return layout;
	};
	
	/**
	 * Constructs and configures a table layout based on this widget's property vlaues.
	 * @return <BMCollectionViewTableLayout>		A table layout.
	 */
	createTableLayout(): BMCollectionViewTableLayout {
		var layout = new BMCollectionViewTableLayout();
		layout.rowHeight = this.getProperty('CellHeight');
		
		if (this.getProperty('SectionField')) {
		
			layout.showsHeaders = this.getProperty('ShowsHeaders');
			layout.headerHeight = this.getProperty('HeaderHeight');
			
			layout.showsFooters = this.getProperty('ShowsFooters');
			layout.footerHeight = this.getProperty('FooterHeight');
			
			layout.pinsHeadersToContentEdge = this.getProperty('TableLayoutPinsHeadersToContentEdge', NO);
			layout.pinsFootersToContentEdge = this.getProperty('TableLayoutPinsFootersToContentEdge', NO);
			
		}
			
		layout.sectionInsets = BMInsetMake(this.getProperty('SectionInsetLeft') | 0, 
											this.getProperty('SectionInsetTop') | 0, 
											this.getProperty('SectionInsetRight') | 0, 
											this.getProperty('SectionInsetBottom') | 0
		);
		
		return layout;
	};
	
	/**
	 * Constructs and configures a stack layout based on this widget's property vlaues.
	 * @return <BMCollectionViewStackLayout>		A stack layout.
	 */
	createStackLayout(): BMCollectionViewStackLayout {
		var layout = new BMCollectionViewStackLayout();

		layout.insets = BMInsetMake(this.getProperty('StackLayoutInsetLeft'), 
			this.getProperty('StackLayoutInsetTop'), 
			this.getProperty('StackLayoutInsetRight'), 
			this.getProperty('StackLayoutInsetBottom')
		);

		layout.spread = this.getProperty('StackLayoutSpread');
		layout.numberOfBackgroundCells = this.getProperty('StackLayoutNumberOfBackgroundCells');
		layout.minimumScale = this.getProperty('StackLayoutMinimumScale');
		layout.blursBackgroundCells = this.getProperty('StackLayoutBlursBackgroundCells');
		layout.maximumBlur = this.getProperty('StackLayoutMaximumBlur');
		layout.showsSingleCell = this.getProperty('StackLayoutShowsSingleCell');

		
		return layout;
	};
	
	/**
	 * Constructs and configures a tile layout based on this widget's property vlaues.
	 * @return <BMCollectionViewTileLayout>		A tile layout.
	 */
	createTileLayout(): BMCollectionViewTileLayout {
		var layout = new BMCollectionViewTileLayout();

		layout.gridSize = this.getProperty('TileLayoutGridSize');
		layout.spacing = this.getProperty('TileLayoutSpacing');

		layout.topPadding = this.getProperty('TileLayoutTopPadding');
		layout.bottomPadding = this.getProperty('TileLayoutBottomPadding');
		
		if (this.getProperty('SectionField')) {
		
			layout.showsHeaders = this.getProperty('ShowsHeaders');
			layout.headerHeight = this.getProperty('HeaderHeight');
			
			layout.showsFooters = this.getProperty('ShowsFooters');
			layout.footerHeight = this.getProperty('FooterHeight');
			
			layout.pinsHeadersToContentEdge = this.getProperty('TileLayoutPinsHeadersToContentEdge', NO);
			layout.pinsFootersToContentEdge = this.getProperty('TileLayoutPinsFootersToContentEdge', NO);
			
		}
			
		layout.sectionInsets = BMInsetMake(this.getProperty('SectionInsetLeft') | 0, 
											this.getProperty('SectionInsetTop') | 0, 
											this.getProperty('SectionInsetRight') | 0, 
											this.getProperty('SectionInsetBottom') | 0
		);
		
		return layout;
	};
	
	/**
	 * Constructs and returns a layout object based on this widget's property values.
	 * @return <BMCollectionViewLayout>		A layout.
	 */
	createLayout(): BMCollectionViewLayout {
		var layout = this.getProperty('Layout');
		if (layout == 'table') {
			return this.createTableLayout();
		}
		else if (layout == 'flow') {
			return this.createFlowLayout();
		}
		else if (layout == 'masonry') {
			return this.createMasonryLayout();
		}
		else if (layout == 'stack') {
			return this.createStackLayout();
		}
		else if (layout == 'tile') {
			return this.createTileLayout();
		}
		return this.createFlowLayout();
	}

    // #endregion

    // #region Widget definition

    widgetIconUrl(): string {
        return require('./images/ComposerIcon@2x.png').default;
    }

    widgetProperties(): BMCollectionViewWidgetProperties {
        require("./styles/ide.css");
        let properties: BMCollectionViewWidgetProperties = {
			name: 'Collection View',
			description: 'A widget that manages a list of view elements, efficiently adding and removing them from view based on the current scroll position.',
			icon: 'BMCollectionView.ide.png',
			category: ['Common'],
			supportsAutoResize: YES,
			needsDataLoadingAndError: NO,
			isVisible: !EXTENSION_MODE,
			properties: {
				// ******************************************** STANDARD PROPERTIES ********************************************
				Width: {
                    defaultValue: 480,
					baseType: 'NUMBER',
					_BMCategories: ['all']
				},
				Height: {
                    defaultValue: 640,
					baseType: 'NUMBER',
					_BMCategories: ['all']
                },
                CustomClass: {
                    description: TW.IDE.I18NController.translate('tw.button-ide.properties.custom-class.description'),
                    baseType: 'STRING',
                    isLocalizable: NO,
                    isBindingSource: YES,
                    isBindingTarget: YES,
					isVisible: NO,
					_BMCategories: ['all'],
					_BMSection: 'Styles'
                },
				Show: {
					baseType: 'STRING',
					defaultValue: 'all',
					description: 'Controls which property category to show.',
					selectOptions: [
						{text: 'All', value: 'all'},
						{text: 'Data Configuration', value: 'data'},
						{text: 'Layout', value: 'layout'},
						//{text: 'Table Layout', value: 'table'},
						{text: 'Flow Layout', value: 'flow'},
						{text: 'Masonry Layout', value: 'masonry'},
						{text: 'Stack Layout', value: 'stack'},
						{text: 'Tile Layout', value: 'tile'},
						{text: 'Cell Configuration', value: 'cell'},
						{text: 'Selection', value: 'selection'},
						{text: 'Styles', value: 'styles'},
						{text: 'Scrollbar', value: 'scrollbar'},
						{text: 'Menu', value: 'menu'},
						{text: 'Data Manipulation', value: 'manipulation'},
						{text: 'Performance', value: 'performance'}
					],
					_BMCategories: ['all']
				},
				
				
				
				// ******************************************** DATA SET PROPERTIES ********************************************
				Data: {
					baseType: 'INFOTABLE',
					isBindingTarget: YES,
					isBindingSource: YES,
					description: 'Represents the data source of this collection view. Whenever the data is updated, either through drag & drop, deleting, inserting or modifying mashup parameters, this property will contain the updated data.',
					_BMSection: 'Data',
					_BMCategories: ['all', 'data']
				},
				UIDField: {
					baseType: 'FIELDNAME',
					sourcePropertyName: 'Data',
					description: 'Represents the unique identifier of a collection view item. This can be any type of field that uniquely identifies an item.',
					_BMSection: 'Data',
					_BMFriendlyName: 'UID Field',
					_BMCategories: ['all', 'data']
				},
				SortField: {
					baseType: 'FIELDNAME',
					sourcePropertyName: 'Data',
					description: 'Optional. When set or bound, this is the infotable field by which section contents are sorted. The sorting is performed client-side and does not affect the source infotable or other widgets bound to the data set.',
					isBindingTarget: YES,
					_BMSection: 'Data',
					_BMFriendlyName: 'Sort Field',
					_BMCategories: ['all', 'data']
				},
				SortAscending: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					isBindingTarget: YES,
					description: 'Used with SortField. When enabled, the sort will be performed ascending, otherwise it will be descending.',
					_BMCategories: ['all', 'data']
				},
				SectionField: {
					baseType: 'FIELDNAME',
					sourcePropertyName: 'Data',
					description: 'Optional. Represents the section identifier by which to group the items. If set, the items will be grouped in sections.'	,
					_BMSection: 'Layout Type',
					_BMFriendlyName: 'Section Field',
					_BMCategories: ['all', 'data']
				},
				// NOTE: Filters are currently unsupported
				/*Filter: {
					baseType: 'QUERY',
					description: 'Optional. When set or bound, this will filter the data set client-side. The filter will only affect this collection view, and not other widgets bound to the same data set.',
					isBindingTarget: YES
				},
				FilteredData: {
					baseType: 'INFOTABLE',
					isBindingSource: YES,
					description: 'When using a filter, this is the filtered infotable.'	
				},*/
				
				
				// ******************************************** LAYOUT TYPE PROPERTIES ********************************************
				/*SectionInsets: {
					baseType: 'STRING',
					defaultValue: '0, 0, 0, 0',
					description: 'If using sections, this represents the left, top, right and bottom paddings that each section will have from eachother and the edge.',
					_BMSection: 'Layout Type',
					_BMFriendlyName: 'Section Insets'
				},*/
				Layout: {
					baseType: 'STRING',
					defaultValue: 'flow',
					description: 'The type of layout to use.',
					selectOptions: [
						//{text: 'Table', value: 'table'},
						{text: 'Flow', value: 'flow'},
						{text: 'Masonry', value: 'masonry'},
						{text: 'Stack', value: 'stack'},
						{text: 'Tile', value: 'tile'}
					],
					isBindingTarget: true,
					_BMSection: 'Layout Type',
					_BMFriendlyName: 'Layout',
					_BMCategories: ['all', 'layout']
				},
				SectionInsetLeft: {
					baseType: 'NUMBER',
					defaultValue: 0,
					description: 'If using sections, this represents the left section inset',
					_BMCategories: ['all', 'table', 'flow']
				},
				SectionInsetTop: {
					baseType: 'NUMBER',
					defaultValue: 0,
					description: 'If using sections, this represents the left section inset',
					_BMCategories: ['all', 'table', 'flow']
				},
				SectionInsetRight: {
					baseType: 'NUMBER',
					defaultValue: 0,
					description: 'If using sections, this represents the left section inset',
					_BMCategories: ['all', 'table', 'flow']
				},
				SectionInsetBottom: {
					baseType: 'NUMBER',
					defaultValue: 0,
					description: 'If using sections, this represents the left section inset',
					_BMCategories: ['all', 'table', 'flow']
				},
				
				
				
				// ******************************************** TABLE LAYOUT PROPERTIES ********************************************
				TableLayoutPinsHeadersToContentEdge: {
					baseType: 'BOOLEAN',
					defaultValue: false,
					description: 'Must be used with Table layout. If enabled, the currently visible section\'s header will be stuck to the top edge of the collection view.',
					isVisible: NO,
					_BMSection: 'Table Layout',
					_BMFriendlyName: 'Pin Headers',
					_BMCategories: ['all', 'table']
				},
				TableLayoutPinsFootersToContentEdge: {
					baseType: 'BOOLEAN',
					defaultValue: false,
					description: 'Must be used with Table layout. If enabled, the currently visible section\'s footer will be stuck to the bottom edge of the collection view.',
					isVisible: NO,
					_BMSection: 'Table Layout',
					_BMFriendlyName: 'Pin Footers',
					_BMCategories: ['all', 'table']
				},
				
				
				
				// ******************************************** FLOW LAYOUT PROPERTIES ********************************************
				FlowLayoutMaximumCellsPerRow: {
					baseType: 'INTEGER',
					defaultValue: 0,
					description: 'Must be used with Flow layout. Controls how many cells each row is allowed to have.',
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Maximum cells per row',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutOrientation: {
					baseType: 'STRING',
					defaultValue: 'Vertical',
					description: 'Must be used with Flow layout. Controls the axis along which rows are created.',
					selectOptions: [
						{text: 'Vertical', value: 'Vertical'},
						{text: 'Horizontal', value: 'Horizontal'}
					],
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Orientation',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutLeftAlignFinalRow: {
					baseType: 'BOOLEAN',
					defaultValue: false,
					description: 'Must be used with Flow layout. If enabled, the final row in each section will be aligned to the left rather than the center.',
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Left align final row',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutGravity: {
					baseType: 'STRING',
					defaultValue: 'Spaced',
					description: 'Must be used with Flow layout. Controls how cells will flow in their row.',
					selectOptions: [
						{text: 'Edge', value: 'Edge'},
						{text: 'Spaced', value: 'Spaced'},
						{text: 'Center', value: 'Center'},
						{text: 'Start', value: 'Start'},
						{text: 'End', value: 'End'},
						{text: 'Expand', value: 'Expand'}
					],
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Gravity',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutAlignment: {
					baseType: 'STRING',
					defaultValue: 'Center',
					description: 'Must be used with Flow layout. Controls how cells will be aligned vertically in their row.',
					selectOptions: [
						{text: 'Top', value: 'Top'},
						{text: 'Center', value: 'Center'},
						{text: 'Bottom', value: 'Bottom'},
						{text: 'Expand', value: 'Expand'}
					],
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Gravity',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutContentGravity: {
					baseType: 'STRING',
					defaultValue: 'Center',
					description: 'Must be used with Flow layout. Controls how content is aligned vertically within the collection view when its size is smaller than the collection view.',
					selectOptions: [
						{text: 'Start', value: 'Top'},
						{text: 'Center', value: 'Center'},
						{text: 'End', value: 'Bottom'},
						{text: 'Expand', value: 'Expand'}
					],
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Gravity',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutRowSpacing: {
					baseType: 'INTEGER',
					defaultValue: 44,
					description: 'Must be used with Flow layout. Controls the spacing between headers, rows and footers.',
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Row spacing',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutMinimumSpacing: {
					baseType: 'INTEGER',
					defaultValue: 0,
					description: 'Must be used with Flow layout. Controls the minimum amount of horizontal spacing between the cells.',
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Row spacing',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutTopPadding: {
					baseType: 'INTEGER',
					defaultValue: 22,
					description: 'Must be used with Flow layout. Controls the padding the collection view\'s top margin and the first item.',
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Top padding',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutBottomPadding: {
					baseType: 'INTEGER',
					defaultValue: 22,
					description: 'Must be used with Flow layout. Controls the padding the collection view\'s bottom margin and the last item.',
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Bottom padding',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutPinsHeadersToContentEdge: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'Must be used with Flow layout. If enabled, the currently visible section\'s header will be stuck to the top edge of the collection view.',
					_BMSection: 'Table Layout',
					_BMFriendlyName: 'Pin Headers',
					_BMCategories: ['all', 'flow']
				},
				FlowLayoutPinsFootersToContentEdge: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'Must be used with Flow layout. If enabled, the currently visible section\'s footer will be stuck to the bottom edge of the collection view.',
					_BMSection: 'Table Layout',
					_BMFriendlyName: 'Pin Footers',
					_BMCategories: ['all', 'flow']
				},
				
				
				
				// ******************************************** MASONRY LAYOUT PROPERTIES ********************************************
				MasonryLayoutNumberOfColumns: {
					baseType: 'INTEGER',
					defaultValue: 5,
					description: 'Must be used with Masonry layout. If set to a number greater than 0, this is the number of columns the masonry layout will render.',
					_BMSection: 'Masonry Layout',
					_BMFriendlyName: 'Number of columns',
					_BMCategories: ['all', 'masonry']
				},
				MasonryLayoutColumnWidth: {
					baseType: 'INTEGER',
					defaultValue: 0,
					description: 'Must be used with Masonry layout. If the number of columns isn\'t specified, this is the minimum width to use for each column.',
					_BMSection: 'Masonry Layout',
					_BMFriendlyName: 'Column width',
					_BMCategories: ['all', 'masonry']
				},
				MasonryLayoutColumnSpeeds: {
					baseType: 'STRING',
					defaultValue: '1, 2, 0.5, 1, 2, 0.5',
					description: 'Must be used with Masonry layout. This is the scrolling speed modifier for each column.',
					_BMSection: 'Masonry Layout',
					_BMFriendlyName: 'Column speeds',
					_BMCategories: ['all', 'masonry']
				},
				MasonryLayoutColumnSpacing: {
					baseType: 'INTEGER',
					defaultValue: 22,
					description: 'Must be used with Masonry layout. Controls the horizontal spacing between columns.',
					_BMSection: 'Masonry Layout',
					_BMFriendlyName: 'Column spacing',
					_BMCategories: ['all', 'masonry']
				},
				MasonryLayoutCellSpacing: {
					baseType: 'INTEGER',
					defaultValue: 22,
					description: 'Must be used with Masonry layout. Controls the vertical spacing between cells.',
					_BMSection: 'Masonry Layout',
					_BMFriendlyName: 'Cell spacing',
					_BMCategories: ['all', 'masonry']
				},
				MasonryLayoutTopPadding: {
					baseType: 'INTEGER',
					defaultValue: 22,
					description: 'Must be used with Masonry layout. Controls the padding the collection view\'s top margin and the first item.',
					_BMSection: 'Masonry Layout',
					_BMFriendlyName: 'Top padding',
					_BMCategories: ['all', 'masonry']
				},
				MasonryLayoutBottomPadding: {
					baseType: 'INTEGER',
					defaultValue: 22,
					description: 'Must be used with Masonry layout. Controls the padding the collection view\'s bottom margin and the last item.',
					_BMSection: 'Masonry Layout',
					_BMFriendlyName: 'Bottom padding',
					_BMCategories: ['all', 'masonry']
				},
				
				
				
				// ******************************************** TILE LAYOUT PROPERTIES ********************************************
				TileLayoutGridSize: {
					baseType: 'NUMBER',
					defaultValue: 256,
					description: 'Must be used with Tile layout. If set to a positive number, cell sizes will be constrained to the closest multiple of this number.',
					_BMSection: 'Tile Layout',
					_BMFriendlyName: 'Grid Size',
					_BMCategories: ['all', 'tile']
				},
				TileLayoutSpacing: {
					baseType: 'NUMBER',
					defaultValue: 32,
					description: 'Must be used with Tile layout. If set to a positive number, cells will have at least this amount spacing between them and all other cells.',
					_BMSection: 'Tile Layout',
					_BMFriendlyName: 'Spacing',
					_BMCategories: ['all', 'tile']
				},
				TileLayoutTopPadding: {
					baseType: 'INTEGER',
					defaultValue: 22,
					description: 'Must be used with Tile layout. Controls the padding the collection view\'s top margin and the first item.',
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Top padding',
					_BMCategories: ['all', 'tile']
				},
				TileLayoutBottomPadding: {
					baseType: 'INTEGER',
					defaultValue: 22,
					description: 'Must be used with Tile layout. Controls the padding the collection view\'s bottom margin and the last item.',
					_BMSection: 'Flow Layout',
					_BMFriendlyName: 'Bottom padding',
					_BMCategories: ['all', 'tile']
				},
				TileLayoutPinsHeadersToContentEdge: {
					baseType: 'BOOLEAN',
					defaultValue: false,
					description: 'Must be used with Tile layout. If enabled, the currently visible section\'s header will be stuck to the top edge of the collection view.',
					_BMSection: 'Table Layout',
					_BMFriendlyName: 'Pin Headers',
					_BMCategories: ['all', 'tile']
				},
				TileLayoutPinsFootersToContentEdge: {
					baseType: 'BOOLEAN',
					defaultValue: false,
					description: 'Must be used with Tile layout. If enabled, the currently visible section\'s footer will be stuck to the bottom edge of the collection view.',
					_BMSection: 'Table Layout',
					_BMFriendlyName: 'Pin Footers',
					_BMCategories: ['all', 'tile']
				},
				
				
				// ******************************************** STACK LAYOUT PROPERTIES ********************************************
				StackLayoutShowsSingleCell: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'If enabled, stack layout will only show the first cell.',
					_BMCategories: ['all', 'stack']
				},
				StackLayoutInsetLeft: {
					baseType: 'NUMBER',
					defaultValue: 0,
					description: 'The left inset used by stack layout.',
					_BMCategories: ['all', 'stack']
				},
				StackLayoutInsetTop: {
					baseType: 'NUMBER',
					defaultValue: 0,
					description: 'The top inset used by stack layout.',
					_BMCategories: ['all', 'stack']
				},
				StackLayoutInsetRight: {
					baseType: 'NUMBER',
					defaultValue: 0,
					description: 'The right inset used by stack layout.',
					_BMCategories: ['all', 'stack']
				},
				StackLayoutInsetBottom: {
					baseType: 'NUMBER',
					defaultValue: 0,
					description: 'The bottom inset used by stack layout.',
					_BMCategories: ['all', 'stack']
				},
				StackLayoutSpread: {
					baseType: 'NUMBER',
					defaultValue: 22,
					description: 'Controls the spacing between background cells.',
					_BMCategories: ['all', 'stack']
				},
				StackLayoutNumberOfBackgroundCells: {
					baseType: 'NUMBER',
					defaultValue: 3,
					description: 'Controls how many background cells will be shown.',
					_BMCategories: ['all', 'stack']
				},
				StackLayoutMinimumScale: {
					baseType: 'NUMBER',
					defaultValue: .9,
					description: 'Controls how much the background cells will scale down before disappearing.',
					_BMCategories: ['all', 'stack']
				},
				StackLayoutBlursBackgroundCells: {
					baseType: 'BOOLEAN',
					defaultValue: YES,
					description: 'Controls whether the background cells will become blurred as they disappear.',
					_BMCategories: ['all', 'stack']
				},
				StackLayoutMaximumBlur: {
					baseType: 'NUMBER',
					defaultValue: 8,
					description: 'Controls how much the background cells will blur before disappearing.',
					_BMCategories: ['all', 'stack']
				},
				
				// ******************************************** CELL PROPERTIES ********************************************
				CellMashupName: {
					baseType: 'MASHUPNAME',
					description: 'The mashup to use for data items.',
					_BMSection: 'Cells',
					_BMFriendlyName: 'Mashup name',
					_BMCategories: ['all', 'cell']
				},
				CellMashupNameField: {
					baseType: 'FIELDNAME',
					sourcePropertyName: 'Data',
					description: 'The field containing the mashup to use for data items. When this property is set, CellMashupName, CellMashupNameSelected and CellMashupName editing cannot be used.',
					_BMCategories: ['all', 'cell']
				},
				CellMashupPropertyBinding: {
					baseType: 'STRING',
					defaultValue: '{}',
					description: 'A serialized JSON object that has infotable fields as its keys and mashup parameters as values.',
					_BMSection: 'Cells',
					_BMFriendlyName: 'Mashup property binding',
					_BMCategories: ['all', 'cell']
				},
				CellMashupGlobalPropertyBinding: {
					baseType: 'STRING',
					defaultValue: '{}',
					description: 'A serialized JSON object that has global parameter names as its keys and data types as values. These are properties that may be bound on the collection view and will be sent down to each cell mashup.',
					_BMSection: 'Cells',
					_BMFriendlyName: 'Mashup global property binding',
					_BMCategories: ['all', 'cell']
				},
				CellWidth: {
					baseType: 'INTEGER',
					defaultValue: 44,
					description: 'Must be used with Flow layout. The default width to use for the collection view cells.',
					_BMSection: 'Cells',
					_BMFriendlyName: 'Cell width',
					_BMCategories: ['all', 'flow', 'cell', 'tile']
				},
				CellHeight: {
					baseType: 'INTEGER',
					defaultValue: 44,
					description: 'Must be used with Flow or Table layout. The default height to use for the collection view cells.',
					_BMSection: 'Cells',
					_BMFriendlyName: 'Cell height',
					_BMCategories: ['all', 'table', 'flow', 'cell', 'tile']
				},
				CellWidthField: {
					baseType: 'FIELDNAME',
					sourcePropertyName: 'Data',
					description: 'When set, has priority over CellWidth. Must be used with Flow layout. The default width to use for the collection view cells.',
					_BMSection: 'Cells',
					_BMFriendlyName: 'Cell width',
					_BMCategories: ['all', 'flow', 'cell', 'tile']
				},
				CellHeightField: {
					baseType: 'FIELDNAME',
					sourcePropertyName: 'Data',
					description: 'When set, has priority over CellHeight. Must be used with Flow or Table layout. The default height to use for the collection view cells.',
					_BMSection: 'Cells',
					_BMFriendlyName: 'Cell height',
					_BMCategories: ['all', 'table', 'flow', 'cell', 'tile']
				},
				CellMashupHasIntrinsicSize: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'Must be used with CellMashupNameField and static cell mashups. When this property is enabled, the collection view will use each mashup type\'s size as the cell size.',
					_BMCategories: ['all', 'table', 'flow', 'cell', 'tile']
				},
				AutomaticCellSize: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'BETA. Must be used with flow layout and a cell mashup whose root widget is a BMView widget. If enabled, the size of the cells will be determined from the intrinsic size of the cell\'s contents.\
					When this property is enabled, the CellWidth and CellHeight property should be set to the average expected cell size.',
					_BMCategories: ['all', 'flow', 'cell']
				},
				
				
				
				// ******************************************** SELECTION PROPERTIES ********************************************
				CanSelectCells: {
					baseType: 'BOOLEAN',
					defaultValue: true,
					description: 'If enabled, cells can be selected, otherwise cells will be unselectable by this collection view.',
					_BMSection: 'Selection',
					_BMFriendlyName: 'Cell selection',
					_BMCategories: ['all', 'selection']
				},
				/*CanSelectMultipleCells: {
					baseType: 'BOOLEAN',
					defaultValue: true,
					description: 'If enabled, more than one cell can be selected at a time.',
					_BMSection: 'Selection',
					_BMFriendlyName: 'Multi-selection'
				},*/
				CellMultipleSelectionType: {
					baseType: 'STRING',
					defaultValue: 'Disabled',
					description: 'Controls the multiple selection behaviour.',
					selectOptions: [
						{text: 'Disabled', value: 'Disabled'},
						{text: 'Click/Tap', value: 'ClickTap'},
						{text: 'Selection Mode', value: 'SelectionMode'},
						{text: 'Ctrl+Click', value: 'CtrlClick'}
					],
					_BMCategories: ['all', 'selection']
				},
				CellMultipleSelectionModeEnabled: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					isBindingSource: YES,
					isEditable: NO,
					description: 'Will be set to true whenever the multiple selection mode is active.',
					_BMCategories: ['all', 'selection']
				},
				HasSelectedCells: {
					baseType: 'BOOLEAN',
					isEditable: NO,
					description: 'Will be set to true whenever there is at least one selected cell in this collection view.',
					isBindingSource: YES,
					defaultValue: NO	,
					_BMCategories: ['all', 'selection']
				},
				SelectedCellsCount: {
					baseType: 'INTEGER',
					isEditable: NO,
					description: 'Contains the number of selected cells in the collection view.',
					isBindingSource: YES,
					defaultValue: 0,
					_BMCategories: ['all', 'selection']
				},
				ScrollsToSelectedCell: {
					baseType: 'BOOLEAN',
					description: 'When enabled, whenever any other widget changes the selection, the collection view will automatically scroll to the first selected cell.',
					defaultValue: NO,
					_BMCategories: ['all', 'selection']
				},
				AutoSelectsFirstCell: {
					baseType: 'BOOLEAN',
					description: 'When enabled, when data is updated and no cell is selected, the collection view will automatically select the first available cell.',
					defaultValue: NO,
					_BMCategories: ['all', 'selection']
				},
				CellMashupSelectedField: {
					baseType: 'STRING',
					defaultValue: '',
					description: 'Optional. If specified, this represents the mashup parameter that will receive the selected state of the object it is bound to.',
					_BMSection: 'Cells',
					_BMFriendlyName: 'Mashup selected parameter',
					_BMCategories: ['all', 'cell', 'selection']
				},

				
				// ******************************************** HIGHLIGHT PROPERTIES ********************************************
				KeyboardHighlightingEnabled: {
					baseType: 'BOOLEAN',
					description: 'When enabled, keyboard navigation can be used to highlight cells.',
					defaultValue: NO,
					_BMCategories: ['all', 'highlighting']
				},
				KeyboardAutoHighlightsFirstCell: {
					baseType: 'BOOLEAN',
					description: 'When enabled, when data is updated and no cell is highlighted, the collection view will automatically highlight the first available cell.',
					defaultValue: NO,
					_BMCategories: ['all', 'selection']
				},
				KeyboardHighlightingBehaviour: {
					baseType: 'STRING',
					defaultValue: 'Highlight',
					description: 'Controls what happens when a cell is highlighted.',
					selectOptions: [
						{text: 'Highlight', value: 'Highlight'},
						{text: 'Select', value: 'Select'}
					],
					_BMCategories: ['all', 'selection']
				},
				KeyboardHighlightingSpacebarBehaviour: {
					baseType: 'STRING',
					defaultValue: 'Event',
					description: 'Controls what happens the spacebar key is pressed while a cell is highlighted.',
					selectOptions: [
						{text: 'Event', value: 'Event'},
						{text: 'Click', value: 'Click'},
						{text: 'Select', value: 'Select'}
					],
					_BMCategories: ['all', 'selection']
				},
				KeyboardHighlightingReturnBehaviour: {
					baseType: 'STRING',
					defaultValue: 'Event',
					description: 'Controls what happens the return key is pressed while a cell is highlighted.',
					selectOptions: [
						{text: 'Event', value: 'Event'},
						{text: 'Click', value: 'Click'},
						{text: 'Select', value: 'Select'}
					],
					_BMCategories: ['all', 'selection']
				},
				KeyboardHighlightOmitsInputElements: {
					baseType: 'STRING',
					defaultValue: 'All',
					description: 'Controls which parts of keyboard navigation are disabled when an input or button element has keyboard focus.',
					selectOptions: [
						{text: 'All', value: 'All'},
						{text: 'Navigation', value: 'Navigation'},
						{text: 'Actions', value: 'Actions'},
						{text: 'None', value: 'None'}
					],
					_BMCategories: ['all', 'selection']
				},
				KeyboardBlockSelectionEnabled: {
					baseType: 'BOOLEAN',
					description: 'Must be used with KeyboardHighlightEnabled and CellMultipleSelectionType enabled. When enabled, using the shift key with keyboard navigation selects a block of cells.',
					defaultValue: NO,
					_BMCategories: ['all', 'highlighting']
				},
				KeyboardDelegateWidget: {
					baseType: 'STRING',
					description: 'The displayName of a widget that can process keyboard events for this collection view.',
					defaultValue: '',
					_BMCategories: ['all', 'highlighting']
				},
				KeyboardDelegateWidgetKeys: {
					baseType: 'STRING',
					description: 'An array containing the supported keys that can be processed by the keyboard delegate widget.',
					defaultValue: '["ArrowDown", "ArrowUp", "Enter"]',
					_BMCategories: ['all', 'highlighting']
				},
				KeyboardDelegateWidgetStealFocus: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'Must be used with KeyboardDelegateWidget. When enabled, pressing any supported key will cause this collection view to acquire keyboard focus from the delegate widget.',
					_BMCategories: ['all', 'highlighting']
				},
				TabIndex: {
					baseType: 'NUMBER',
					defaultValue: -1,
					description: 'The tab index to assign to this collection view',
					_BMFriendlyName: 'Mashup selected parameter',
					_BMCategories: ['all', 'highlighting']
				},
				
				
				// ******************************************** STYLE PROPERTIES ********************************************
				BackgroundStyle: {
					baseType: 'STYLEDEFINITION',
					description: 'Controls the background of collection view. Only the backround color property of the style is used.',
					_BMSection: 'Styles',
					_BMFriendlyName: 'Background style',
					_BMCategories: ['all', 'styles']
				},
				CellStyle: {
					baseType: 'STYLEDEFINITION',
					description: 'Controls the background of cells. Only the backround color property of the style is used.',
					_BMSection: 'Styles',
					_BMFriendlyName: 'Background style',
					_BMCategories: ['all', 'styles']
				},
				CellStyleSelected: {
					baseType: 'STYLEDEFINITION',
					description: 'Controls the background of the selected cells. Only the backround color property of the style is used.',
					_BMSection: 'Styles',
					_BMFriendlyName: 'Selected style',
					_BMCategories: ['all', 'styles']
				},
				CellMashupNameSelected: {
					baseType: 'MASHUPNAME',
					description: 'If specified, has priority over CellStyleSelected. An alternative mashup to use for selected cells. This mashup should have the same properties as the cell mashup.',
					_BMSection: 'Styles',
					_BMFriendlyName: 'Selected Mashup name',
					_BMCategories: ['all', 'styles']
				},
				CellStyleHover: {
					baseType: 'STYLEDEFINITION',
					description: 'Controls the background of the cells when hovering. Only the background color property of the style is used.',
					_BMSection: 'Styles',
					_BMFriendlyName: 'Hover style',
					_BMCategories: ['all', 'styles']
				},
				CellStyleActive: {
					baseType: 'STYLEDEFINITION',
					description: 'Controls the background of the cells when pressed. Only the background color property of the style is used.',
					_BMSection: 'Cells',
					_BMFriendlyName: 'Active style',
					_BMCategories: ['all', 'styles']
				},
				CellBorderRadius: {
					baseType: 'STRING',
					description: 'An optional border radius to apply to the cells. When this value is set to a non-empty string, the cells will have their overflow property set to hidden.',
					defaultValue: 0,
					_BMSection: 'Styles',
					_BMFriendlyName: 'Border radius',
					_BMCategories: ['all', 'styles']
				},
				CellBoxShadow: {
					baseType: 'STRING',
					description: 'When set to a non-empty string, this will be used as the box-shadow for the cells.',
					defaultValue: '',
					_BMSection: 'Styles',
					_BMFriendlyName: 'Box shadow',
					_BMCategories: ['all', 'styles']
				},
				CellPointer: {
					baseType: 'STRING',
					description: 'Controls how the mouse pointer appears when hovering over this collection view\'s cells.',
					selectOptions: [
						{text: 'Auto', value: 'auto'},
						{text: 'Hand', value: 'pointer'},
						{text: 'Arrow', value: 'default'}
					],
					defaultValue: 'Auto',
					_BMCategories: ['all', 'styles']
				},
				UsesRipple: {
					baseType: 'BOOLEAN',
					defaultValue: false,
					description: 'If enabled, a ripple effect is used when clicking on cells. Using this option will cause the cells to have their overflow property set to hidden.',
					_BMSection: 'Styles',
					_BMFriendlyName: 'Ripple',
					_BMCategories: ['all', 'styles']
				},
				RippleStyle: {
					baseType: 'STYLEDEFINITION',
					description: 'Must be used with UsesRipple. Only the background color property of this style is used, which will be applied to the ripple effect.',
					_BMSection: 'Styles',
					_BMFriendlyName: 'Ripple style',
					_BMCategories: ['all', 'styles']
				},
				
				
				
				// ******************************************** SCROLLBAR PROPERTIES ********************************************
				ScrollbarStyle: {
					baseType: 'STYLEDEFINITION',
					description: 'The style to use for the scrollbar.',
					_BMSection: 'Scrollbar',
					_BMFriendlyName: 'Scrollbar Style',
					_BMCategories: ['all', 'styles', 'scrollbar']
				},
				ScrollbarTrackStyle: {
					baseType: 'STYLEDEFINITION',
					description: 'Only used if you have also set a scrollbar style. The style to use for the scrollbar track.',
					_BMSection: 'Scrollbar',
					_BMFriendlyName: 'Scrollbar Style',
					_BMCategories: ['all', 'styles', 'scrollbar']
				},
				ScrollbarBorderRadius: {
					baseType: 'NUMBER',
					description: 'Only used if you have also set a scrollbar style. The border radius to apply to the scrollbar, in pixels.',
					defaultValue: 6,
					_BMSection: 'Scrollbar',
					_BMFriendlyName: 'Scrollbar Width',
					_BMCategories: ['all', 'styles', 'scrollbar']
				},
				ScrollbarWidth: {
					baseType: 'NUMBER',
					description: 'Only used if you have also set a scrollbar style. The width of the scrollbar, in pixels.',
					defaultValue: 12,
					_BMSection: 'Scrollbar',
					_BMFriendlyName: 'Scrollbar Width',
					_BMCategories: ['all', 'styles', 'scrollbar']
				},
				LinkedCollectionView: {
					baseType: 'STRING',
					description: 'When set to the DisplayName of a Collection View, this Collection View\'s scroll position will be linked to the target\'s scroll position.',
					defaultValue: '',
					_BMSection: 'Scrollbar',
					_BMFriendlyName: 'Linked Collection View',
					_BMCategories: ['all', 'scrollbar']
				},
				
				
				
				// ******************************************** MENU PROPERTIES ********************************************
				CellSlideMenu: {
					baseType: 'STATEDEFINITION',
					description: 'If set to a string-based state definition, this will be the cell menu that appears when sliding over the cells. On devices without a touch interface, this menu can be displayed by right-clicking on the cells.',
					_BMSection: 'Menu',
					_BMFriendlyName: 'Slide menu definition',
					_BMCategories: ['all', 'menu']
				},
				CellSlideMenuUseBuiltin: {
					baseType: 'BOOLEAN',
					defaultValue: YES,
					description: 'If disabled, the default menu invoking behaviours will be disabled.',
					_BMCategories: ['all', 'menu']
				},
				CellSlideMenuIconSize: {
					baseType: 'INTEGER',
					description: 'Must be used with CellSlideMenu. The menu icons will be set to this size.',
					defaultValue: 16,
					_BMSection: 'Menu',
					_BMFriendlyName: 'Icon size',
					_BMCategories: ['all', 'menu']
				},
				CellSlideMenuIconGravity: {
					baseType: 'STRING',
					description: 'Must be used with CellSlideMenu. Controls how the icon is anchored to the text in the menu entry.',
					selectOptions: [
						{text: 'Left', value: 'Left'},
						{text: 'Above', value: 'Above'},
						{text: 'Right', value: 'Right'},
						{text: 'Below', value: 'Below'}
					],
					defaultValue: 'Left',
					_BMSection: 'Menu',
					_BMFriendlyName: 'Icon gravity',
					_BMCategories: ['all', 'menu']
				},
				CellSlideMenuOrientation: {
					baseType: 'STRING',
					description: 'Must be used with CellSlideMenu. Controls how the menu entries are laid out.',
					selectOptions: [
						{text: 'Horizontal', value: 'Horizontal'},
						{text: 'Vertical', value: 'Vertical'}
					],
					defaultValue: 'Horizontal',
					_BMSection: 'Menu',
					_BMFriendlyName: 'Orientation',
					_BMCategories: ['all', 'menu']
				},
				CellSlideMenuType: {
					baseType: 'STRING',
					description: 'Must be used with CellSlideMenu. Controls how the slide menu appears.',
					selectOptions: [
						{text: 'Auto', value: 'Auto'},
						{text: 'Slide', value: 'Slide'},
						{text: 'Popup', value: 'Popup'}
					],
					defaultValue: 'Auto',
					_BMCategories: ['all', 'menu']
				},
				
				
				
				// ******************************************** HEADER PROPERTIES ********************************************
				ShowsHeaders: {
					baseType: 'BOOLEAN',
					defaultValue: false,
					description: 'If enabled and using sections, each section will have a header.',
					_BMSection: 'Header',
					_BMFriendlyName: 'Headers',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				HeaderMashupName: {
					baseType: 'MASHUPNAME',
					description: 'Must be used with SectionField and ShowsHeaders. The mashup to use for headers.',
					_BMSection: 'Header',
					_BMFriendlyName: 'Header Mashup name',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				HeaderMashupSectionProperty: {
					baseType: 'STRING',
					defaultValue: '',
					description: 'The mashup parameter that will receive the section identifier.',
					_BMSection: 'Header',
					_BMFriendlyName: 'Section parameter',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				HeaderHeight: {
					baseType: 'INTEGER',
					defaultValue: 44,
					description: 'Must be used with SectionField and ShowsHeaders. The height of the header mashups.',
					_BMSection: 'Header',
					_BMFriendlyName: 'Height',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				
				
				
				// ******************************************** FOOTER PROPERTIES ********************************************
				ShowsFooters: {
					baseType: 'BOOLEAN',
					defaultValue: false,
					description: 'If enabled and using sections, each section will have a footer.',
					_BMSection: 'Footer',
					_BMFriendlyName: 'Footers',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				FooterMashupName: {
					baseType: 'MASHUPNAME',
					description: 'Must be used with SectionField and ShowsFooters. The mashup to use for footers.',
					_BMSection: 'Footer',
					_BMFriendlyName: 'Footer mashup name',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				FooterMashupSectionProperty: {
					baseType: 'STRING',
					defaultValue: '',
					description: 'The mashup parameter that will receive the section identifier.',
					_BMSection: 'Footer',
					_BMFriendlyName: 'Section parameter',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				FooterHeight: {
					baseType: 'INTEGER',
					defaultValue: 44,
					description: 'Must be used with SectionField and ShowsFooters. The height of the footer mashups.',
					_BMSection: 'Footer',
					_BMFriendlyName: 'Height',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				
				
				
				// ******************************************** EMPTY VIEW PROPERTIES ********************************************
				EmptyMashupName: {
					baseType: 'MASHUPNAME',
					description: 'Optional. If specified, this mashup will be displayed when the data set is empty',
					_BMSection: 'Empty View',
					_BMFriendlyName: 'Empty Mashup name',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				EmptyMashupParameters: {
					baseType: 'STRING',
					description: 'A JSON object that specifies static string values that will be assiged as parameters for the empty mashup.',
					defaultValue: '{}',
					isBindingTarget: YES,
					_BMSection: 'Empty View',
					_BMFriendlyName: 'Empty Mashup parameters',
					_BMCategories: ['all', 'table', 'flow', 'tile']
				},
				
				
				
				// ******************************************** ANIMATION PROPERTIES ********************************************
				PlaysIntroAnimation: {
					baseType: 		'BOOLEAN',
					description: 	'If enabled, an animation will be played to show the cells when the data first arrives to this collection view. ' +
									'Otherwise the cells will appear instantly the first time.',
					defaultValue:	true,
					_BMSection: 	'Styles',
					_BMFriendlyName: 'Intro animation',
					_BMCategories: ['all', 'styles']
				},
				
				
				
				// ******************************************** DATA MANIPULATION ********************************************
				
				CanDragCells: {
					baseType: 'BOOLEAN',
					description: 'Can be enabled to allow collection view to manipulate items via drag & drop.',
					defaultValue: NO,
					isBindingTarget: YES,
					_BMCategories: ['all', 'manipulation']
				},
				CanMoveCells: {
					baseType: 'BOOLEAN',
					description: 'Can be enabled to allow collection view to move items via drag & drop.',
					defaultValue: NO,
					_BMCategories: ['all', 'manipulation']
				},
				CanMoveCellsAcrossSections: {
					baseType: 'BOOLEAN',
					description: 'Must be used with CanMoveCells. If enabled, collection view will allow dragged items to move to other sections.',
					defaultValue: NO,
					_BMCategories: ['all', 'manipulation']
				},
				CanRemoveCells: {
					baseType: 'BOOLEAN',
					description: 'Can be enabled to allow collection view to remove items by dragging them out of its frame.',
					defaultValue: NO,
					_BMCategories: ['all', 'manipulation']
				},
				CanTransferCells: {
					baseType: 'BOOLEAN',
					description: 'Can be enabled to allow collection view to transfer items to other collection views.',
					defaultValue: NO,
					_BMCategories: ['all', 'manipulation']
				},
				CellTransferPolicy: {
					baseType: 'STRING',
					description: 'Controls what happens to items when they are dragged into another collection view.',
					selectOptions: [
						{text: 'Move', value: 'Move'},
						{text: 'Copy', value: 'Copy'}
					],
					defaultValue: 'Move',
					_BMCategories: ['all', 'manipulation']
				},
				CanAcceptCells: {
					baseType: 'BOOLEAN',
					description: 'Can be enabled to allow collection view to accept items from other collection views.',
					defaultValue: NO,
					_BMCategories: ['all', 'manipulation']
				},
				CellAcceptPolicy: {
					baseType: 'STRING',
					description: 'Controls what happens to items when they are dragged into this collection view from another collection view.',
					selectOptions: [
						{text: 'Move', value: 'Move'},
						{text: 'Copy', value: 'Copy'},
						{text: 'Replace', value: 'Replace'}
					],
					defaultValue: 'Move',
					_BMCategories: ['all', 'manipulation']
				},
				DataShape: {
					baseType: 'DATASHAPENAME',
					description: 'Optional. If specified and Data is not bound, this allows the CreateItem... services to be invoked.',
					_BMCategories: ['all', 'manipulation']
				},
				CreationIndex: {
					baseType: 'INTEGER',
					description: 'Defaults to 0. If specified or bound, this index is used when invoking the CreateItemAtIndex service.',
					isBindingTarget: YES,
					_BMCategories: ['all', 'manipulation']
				},
				DeletionUID: {
					baseType: 'ANYSCALAR',
					isBindingTarget: YES,
					description: 'Optional. If bound, this item UID is used when invoking the DeleteItem service.',
					_BMCategories: ['all', 'manipulation']
				},
				CellMashupNameEditing: {
					baseType: 'MASHUPNAME',
					description: 'Optional. If specified, this mashup is used for cells that are being edited.'	,
					_BMCategories: ['all', 'cell', 'manipulation']
				},
				CellMashupEditingParameter: {
					baseType: 'STRING',
					description: 'Optional. If specified, this is the mashup parameter that will receive the editing state of the mashup.',
					_BMCategories: ['all', 'cell', 'manipulation']
				},
				EmptyDataSetOnStartup: {
					baseType: 'BOOLEAN',
					description: 'Requires setting a data shape. Can be enabled to cause collection view to start with an empty data set.',
					defaultValue: NO,
					_BMCategories: ['all', 'manipulation']
				},
				
				
				// ******************************************** PERFORMANCE PROPERTIES ********************************************
				UseCustomScrollerOnWindowsDesktops: {
					baseType: 'BOOLEAN',
					description: 'If enabled, the collection view will use iOS/macOS style scrollbars when running on desktop Windows browsers.',
					defaultValue: NO,
					_BMSection: 'Avanced',
					_BMFriendlyName: 'Enable iScroll on Windows Desktops',
					_BMCategories: ['all', 'performance']
				},
				AlwaysUseCustomScrollerOniOS: {
					baseType: 'BOOLEAN',
					description: 'If enabled, the collection will use the custom scroller on iOS even when not running in web-app mode',
					defaultValue: NO,
					_BMSection: 'Avanced',
					_BMFriendlyName: 'Enable iScroll on iOS Safari',
					_BMCategories: ['all', 'performance']
				},
				OffScreenBufferFactor: {
					baseType: 'NUMBER',
					defaultValue: 0.5,
					description: 'The percentage of frame size to use when computing a new off-screen buffer size. Higher values will cause more off-screen elements to be rendered which decreases the flicker at high scrolling speeds. Lower values decrease the number of off-screen elements and should be used to reduce the jitter on iOS when complex layouts that reflow often are used as cell contents (such as cells with many gauges).',
					_BMSection: 'Avanced',
					_BMFriendlyName: 'Off-screen buffer factor',
					_BMCategories: ['all', 'performance']
				},
				'[Experimental] Fast widget append': {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'If enabled, the collection view will use an experimental faster widget creation method.',
					_BMSection: 'Avanced',
					_BMFriendlyName: 'Experimental fast widget append',
					_BMCategories: ['all', 'performance']
				},
				HandlesResponsiveWidgets: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'If enabled, the collection view will invoke resize on responsive widgets.',
					_BMCategories: ['all', 'performance']
				},
				HandlesResponsiveWidgetsImmediately: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'If enabled, the collection view will invoke resize on responsive widgets during animations.',
					_BMCategories: ['all', 'performance']
				},
				DirectLink: {
					baseType: 'BOOLEAN',
					defaultValue: NO,
					description: 'Requires the Debugger entities and extensions. If enabled, changes to this Collection View layout will automatically update the mashup.',
					_BMCategories: ['all', 'performance']
				},
				
				
				
				// ******************************************** INTERNAL PROPERTIES ********************************************
				_Left: {
					baseType: 'NUMBER',
					isVisible: NO,
					_BMCategories: []
				},
				_Top: {
					baseType: 'NUMBER',
					isVisible: NO,
					_BMCategories: []
				},
				_Width: {
					baseType: 'NUMBER',
					isVisible: NO,
					_BMCategories: []
				},
				_Height: {
					baseType: 'NUMBER',
					isVisible: NO,
					_BMCategories: []
				},
				_EventDataShape: {
					baseType: 'STRING',
					isVisible: false,
					defaultValue: '{}',
					_BMCategories: []
				},
				_CanDoubleClick: {
					baseType: 'BOOLEAN',
					isVisible: false,
					defaultValue: false,
					_BMCategories: []
				},
				_MenuDefinition: {
					baseType: 'STRING',
					isVisible: false,
					defaultValue: '[]',
					_BMCategories: []
				},
				_GlobalDataShape: {
					baseType: 'STRING',
					isVisible: false,
					defaultValue: '{}',
					_BMCategories: []
				},
				DirectLinkUUID: {
					baseType: 'STRING',
					defaultValue: '',
					isVisible: NO,
					_BMCategories: []
				},
				__BaseTypes: {
					baseType: 'INFOTABLE',
					isVisible: NO,
					_BMCategories: []
				}
			}
		};

		if (!('BMCoreComposer' in window)) {
			delete properties.properties.DirectLink;
			delete properties.properties.DirectLinkUUID
		}

		return properties;
    };

    widgetServices(): Dictionary<BMCollectionViewWidgetService> {
		return {
			Deselect: {_BMCategories: ['all', 'selection'], description: 'Should be invoked to cause the collection view to deselect all rows from its data set.'},
			SelectAll: {_BMCategories: ['all', 'selection'], description: 'Should be invoked to cause the collection view to select all rows in its data set.'},
			AcquireFocus: {_BMCategories: ['all', 'highlighting'], description: 'Should be invoked to cause the collection view to acquire keyboard focus.'},
			ResignFocus: {_BMCategories: ['all', 'highlighting'], description: 'Should be invoked to cause the collection view to resign keyboard focus.'},
			InvalidateLayout: {_BMCategories: ['all', 'performance'], description: 'Should be invoked to cause the collection view to invalidate its layout.'},
			CreateItemAtBeginning: {_BMCategories: ['all', 'manipulation'], description: 'When invoked, the collection view will add an item to the beginning of the data set. If sections are defined, the item will belong to an empty section.'},
			CreateItemAtEnd: {_BMCategories: ['all', 'manipulation'], description: 'When invoked, the collection view will add an item to the end of the data set. If sections are defined, the item will belong to an empty section.'},
			CreateItemAtIndex: {_BMCategories: ['all', 'manipulation'], description: 'When invoked, the collection view will add an item a specific index of the data set. The index is specified by setting or binding the \'CreationIndex\' property. If sections are defined, the item will belong to an empty section.'},
			DeleteItem: {_BMCategories: ['all', 'manipulation'], description: 'When invoked, the collection view will delete a specific item from the data set. The item is specified by setting or binding the \'DeletionUID\' property.'},
			BeginSelectionMode: {_BMCategories: ['all', 'selection'], description: 'Must be used with CellMultipleSelectionType set to Selection Mode. When invoked, the collection view enter selection mode and allow cells to be selected.'},
			FinishSelectionMode: {_BMCategories: ['all', 'selection'], description: 'Must be used with CellMultipleSelectionType set to Selection Mode. When invoked, the collection view exit selection mode, deselect all cells and prevent further cells from being selected.'}
		};
    };

    widgetEvents(): Dictionary<BMCollectionViewWidgetEvent> {
		return {
			CellWasClicked: {_BMCategories: ['all', 'data'], description: 'Triggered whenever any cell is clicked or tapped.'},
			CellWasRightClicked: {_BMCategories: ['all', 'data'], description: 'Triggered whenever any cell is right-clicked.'},
			CellWasDoubleClicked: {_BMCategories: ['all', 'data'], description: 'Triggered whenever any cell is double-clicked or double-tapped.'},
			CellWasLongClicked: {_BMCategories: ['all', 'data'], description: 'Triggered whenever any cell is long-clicked or long-tapped.'},
			ReturnPressed: {_BMCategories: ['all', 'data'], description: 'Triggered whenever the return key is pressed while a cell is highlighted.'},
			SpacebarPressed: {_BMCategories: ['all', 'data'], description: 'Triggered whenever the return key is pressed while a cell is highlighted.'},
			CollectionViewDidAcceptDroppedItems: {_BMCategories: ['all', 'data', 'manipulation'], description: 'Triggered whenever collection view accepts items from another collection view.'},
			CollectionViewDidMoveItems: {_BMCategories: ['all', 'data', 'manipulation'], description: 'Triggered whenever collection view moves items from a drag & drop operation.'},
			CollectionViewDidRemoveItems: {_BMCategories: ['all', 'data', 'manipulation'], description: 'Triggered whenever collection view removes items from a drag & drop operation.'},
			CollectionViewWillBeginInteractiveMovement: {_BMCategories: ['all', 'data', 'manipulation'], description: 'Triggered whenever collection view begins a drag & drop operation. The event fields will be populated with the value of the cell that was used to initiate this operation.'},
			CollectionViewDidFinishInteractiveMovement: {_BMCategories: ['all', 'data', 'manipulation'], description: 'Triggered whenever collection view begins a drag & drop operation. The event fields will be populated with the value of the cell that was used to initiate this operation.'}
			// NOTE: The hover event is currently unsupported
			//CellWasHovered: {description: 'Triggered whenever any cell is hovered.'}
		};
    }

    // #endregion

    // #region Behaviours
	
	/**
	 * A list of layout-specific widget properties.
	 */
    readonly layoutProperties: string[] = ['Layout', 'CellWidth', 'CellHeight', 'ShowsHeaders', 'ShowsFooters', 'HeaderHeight', 'FooterHeight', 'SectionInsets'];

    private configurationWindow?: BMWidgetConfigurationWindow;

    afterSetProperty(name: string, value: any): boolean {
		if (name === 'CellSlideMenu') {
			this.cellSlideMenuDidChange();
		}
		
		if (name === 'CellMashupGlobalPropertyBinding') {
			if (!this.globalPropertiesDidChange()) {
				alert('The JSON is not valid or one of the property names is reserved.');
			}
		}
		
		if (name == 'Width' || name == 'Height') {
			this.collectionView.resized();
		}
		
		if (name.startsWith('TableLayout') || name.startsWith('FlowLayout') || name.startsWith('TileLayout') || name.startsWith('MasonryLayout') || name.startsWith('StackLayout') || name.startsWith('SectionInset') || this.layoutProperties.indexOf(name) != -1) {
			this.collectionView.setLayout(this.createLayout(), {animated: YES});
			if (this.getProperty('DirectLink')) {
				BMDirectLinkPostWithUUID(this.getProperty('DirectLinkUUID'), {update: JSON.stringify({key: name, value: value})});
			}
		}

		if (name.startsWith('Sort')) {
			if (this.getProperty('DirectLink')) {
				BMDirectLinkPostWithUUID(this.getProperty('DirectLinkUUID'), {update: JSON.stringify({key: name, value: value})});
			}
        }

		if (name === 'Show') {
			var properties = this.allWidgetProperties().properties as Dictionary<BMCollectionViewWidgetProperty>;

			for (var key in properties) {
				if (properties[key]._BMCategories) {
					if (properties[key]._BMCategories.indexOf(value) != -1) {
						properties[key].isVisible = YES;
					}
					else {
						properties[key].isVisible = NO;
					}
				}
			}
			
			// Update the properties UI
			this.updatedProperties();
		}

		if (this.configurationWindow) {
			this.configurationWindow._notifyObserversForProperty(name);
		}
		
		return NO;
    }
    
	/**
	 * Will be invoked by the widget after changing the CellSlideMenu property.
	 * Updates the Menu: event list.
	 */
	cellSlideMenuDidChange() {
		var properties = this.allWidgetProperties().properties as Dictionary<BMCollectionViewWidgetProperty>;
		
		// Retrieve the actual state definition from the platform
		var menuStateDefinition = TW.getStateDefinition(this.getProperty('CellSlideMenu'));
		
		// Delete the previous properties from the previous binding
		var oldDefinition = JSON.parse(this.getProperty('_MenuDefinition'));
		
		for (var i = 0; i < oldDefinition.length; i++) {
			delete properties['Menu:' + oldDefinition[i]];
		}
		
		if (!(menuStateDefinition = (menuStateDefinition && menuStateDefinition.content && menuStateDefinition.content.stateDefinitions))) {
			// If the state definition is undefined, there is nothing else to do
			return;
		}
		
		// Extract the state names from the menu definition
		var menuDefinition: any[] = [];
		for (var i = 0; i < menuStateDefinition.length; i++) {
			if (menuStateDefinition[i].defaultValue) menuDefinition.push(menuStateDefinition[i].defaultValue);
		}
		
		
		this.setProperty('_MenuDefinition', JSON.stringify(menuDefinition));
		
		// Append the new properties to this widget
		for (var i = 0; i < menuDefinition.length; i++) {
			properties['Menu:' + menuDefinition[i]] = {
				isBaseProperty: false,
				name: 'Menu:' + menuDefinition[i],
				type: 'event',
				isVisible: true,
				description: 'Triggered when selecting the ' + menuDefinition[i] + ' menu entry on a cell.',
				_BMCategories: ['all', 'menu']
			} as any;
		}
	
		// Update the properties UI
		this.updatedProperties();
	}
	

	/**
	 * Invoked by the runtime immediately after this widget was placed in a mashup.
	 */
	afterLoad() {
		var properties = this.allWidgetProperties().properties;
			
		// Retrieve the data shape and generate the properties for the event fields
		var dataShape = JSON.parse(this.getProperty('_EventDataShape'));
			
		// Append the properties to this widget
		var newProperties = Object.keys(dataShape);
		for (var i = 0; i < newProperties.length; i++) {
			var property = dataShape[newProperties[i]];
			properties['Event:' + newProperties[i]] = BMExtend({
				isBindingSource: YES, 
				isBaseProperty: NO,
				isVisible: YES
			}, property, {
				name: 'Event:' + property.name,
				type: 'property',
				description: 'Initialized before any event is triggered with the value from the triggering cell\'s bound object.',
				_BMCategories: ['all', 'data']
			});
		}
		
		// Retrieve the menu definition and generate the events for that menu
		var menuDefinition = JSON.parse(this.getProperty('_MenuDefinition'));
		for (var i = 0; i < menuDefinition.length; i++) {
			properties['Menu:' + menuDefinition[i]] = <any>{
				isBaseProperty: false,
				name: 'Menu:' + menuDefinition[i],
				type: 'event',
				isVisible: true,
				description: 'Triggered when selecting the ' + menuDefinition[i] + ' menu entry on a cell.',
				_BMCategories: ['all', 'menu']
			};
		}
		
		// Retrieve the global properties and generate the relevant properties
		var globalProperties = JSON.parse(this.getProperty('_GlobalDataShape'));
		for (var key in globalProperties) {
			properties[key] = <any>{
				isBaseProperty: NO,
				name: key,
				type: 'property',
				isVisible: YES,
				isBindingTarget: YES,
				isBindingSource: YES,
				description: 'User-defined global property.',
				baseType: globalProperties[key],
				_BMCategories: ['all', 'data']
			};
		}
		
		// Update the properties UI
		this.updatedProperties();
	};

	
	
	/**
	 * Invoked by the runtime whenever the user binds a data source to a property on this widget.
	 * @param bindingInfo <Object>		An object containing the newly created binding's properties.
	 */
	afterAddBindingSource(bindingInfo: any): void {
		let property = bindingInfo.targetProperty;
		
		if (property === 'Data') {
			var properties = this.allWidgetProperties().properties;
			
			// Retrieve the data shape and generate the properties for the event fields
			var dataShape = this.getInfotableMetadataForProperty('Data') || {};
			
			// Delete the previous properties from the previous binding
			var oldDataShape = JSON.parse(this.getProperty('_EventDataShape'));
			var oldProperties = Object.keys(oldDataShape);
			
			for (var i = 0; i < oldProperties.length; i++) {
				delete properties['Event:' + oldProperties[i]];
			}
			
			this.setProperty('_EventDataShape', JSON.stringify(dataShape));
			
			// Append the new properties to this widget
			var newProperties = Object.keys(dataShape);
			for (var i = 0; i < newProperties.length; i++) {
				let property = dataShape[newProperties[i]];
				properties['Event:' + newProperties[i]] = BMExtend({
					isBindingSource: YES, 
					isBaseProperty: NO,
					isVisible: YES
				}, property, {
					name: 'Event:' + property.name,
					type: 'property',
					description: 'Initialized before any event is triggered with the value from the triggering cell\'s bound object.',
					_BMCategories: ['all', 'data']
				});
			}
		
			// Update the properties UI
			this.updatedProperties();
		}
	};
	
	/**
	 * Will be invoked by the widget after changing the CellMashupGlobalPropertyBinding property.
	 * Updates the global bindable properties.
	 * @return <Boolean>			YES if the global properties string was valid and the properties could be created, NO otherwise.
	 */
	globalPropertiesDidChange(): boolean {
		var globalProperties;
		
		try {
			globalProperties = JSON.parse(this.getProperty('CellMashupGlobalPropertyBinding'));
		}
		catch (err) {
			return NO;
		}
		
		// Delete the previous properties from the previous binding
		var oldDefinition = JSON.parse(this.getProperty('_GlobalDataShape'));

		var properties = this.allWidgetProperties().properties as Dictionary<BMCollectionViewWidgetProperty>;
		
		for (let key in oldDefinition) {
			delete properties[key];
		}
		
		// Verify the new properties to make sure they don't conflict with any of the existing ones
		for (let key in globalProperties) {
			if (properties[key]) {
				// If there is a conflict, fail with an error and set the global properties to a blank object as the previous global properties
				// have been deleted previously
				this.setProperty('_GlobalDataShape', '{}');
				return NO;
			}
		}
		
		// If there are no conflicts, update the global properties and create the relevant properties
		for (let key in globalProperties) {
			properties[key] = {
				isBaseProperty: NO,
				name: key,
				type: 'property',
				isVisible: YES,
				isBindingTarget: YES,
				isBindingSource: YES,
				description: 'User-defined global property.',
				baseType: globalProperties[key],
				_BMCategories: []
			};
		}
		
		this.setProperty('_GlobalDataShape', this.getProperty('CellMashupGlobalPropertyBinding'));
	
		// Update the properties UI
		this.updatedProperties();
		
		return YES;
		
	}

    resize(width: number, height: number): void {
        //this.collectionView.resized();
	}
	
	// @override - TWComposerWidget
	getInfotableMetadataForProperty(propertyName) {
		// As of Thingworx 9, this method will now throw when the data shape does not exist,
		// but collection view relies on the previous behaviour of returning `undefined` in this case
		try {
			return super.getInfotableMetadataForProperty(propertyName);
		}
		catch (e) {
			return undefined;
		}
	}

	/**
	 * Invoked by the platform to retrieve the data shape associated with an infotable property.
	 * @param propertyName <String>				The name of the property whose data shape should be returned.
	 * @return <String or Object, nullable>		The data shape field definitions object or a string identifying a data shape in the platform.
	 *											The return value may also be undefined if the data shape cannot be determined at design time.
	 */
	getSourceDatashapeName(propertyName: string): string | Dictionary<TWFieldDefinition> {
		if (propertyName == 'Data') {
			return this.getInfotableMetadataForProperty(propertyName) || this.getProperty('DataShape');
		}
		else if (propertyName == '__BaseTypes') {
			return {
				STRING: {name: 'STRING', baseType: 'STRING'},
				NUMBER: {name: 'NUMBER', baseType: 'NUMBER'},
				DATETIME: {name: 'DATETIME', baseType: 'DATETIME'},
				INFOTABLE: {name: 'INFOTABLE', baseType: 'INFOTABLE'},
				BOOLEAN: {name: 'BOOLEAN', baseType: 'BOOLEAN'},
				LOCATION: {name: 'LOCATION', baseType: 'LOCATION'}
			}
		}
		return this.getInfotableMetadataForProperty(propertyName)!;
	};

    renderHtml(): string {
		return `
		<div class="widget-content BMCollectionViewWidget">
			<div class="BMCollectionViewWidgetBorder"></div>
			<button class="BMCollectionViewWidgetDowngradeButton" style="' + (EXTENSION_MODE ? 'display: none;' : '') + '">⥥</button>
			<button class="BMCollectionViewWidgetConfigurationButton" style="' + (EXTENSION_MODE ? 'display: none;' : '') + '">CONFIGURE</button>
		</div>`;
    };

    afterRender(): void {
		if (('BMCoreComposer' in window) && !this.getProperty('DirectLinkUUID')) {
			this.setProperty('DirectLinkUUID', BMUUIDMake());
		}
		
		var self = this;
		this.jqElement.find('.BMCollectionViewWidgetConfigurationButton').click(function () {
			if (self.configurationWindow) {
				return self.configurationWindow.becomeKeyWindow();
			}

			var button = this;
			
			var sections = [
				{name: 'data', label: 'Data Configuration'}, 
				{name: 'layout', label: 'Layout Type'}, 
				//{name: 'tableLayout', label: 'Table Layout'}, 
				{name: 'flowLayout', label: 'Flow Layout'}, 
				{name: 'masonryLayout', label: 'Masonry Layout'}, 
				{name: 'stackLayout', label: 'Stack Layout'}, 
				{name: 'tileLayout', label: 'Tile Layout'}, 
				{name: 'cellConfiguration', label: 'Cell Configuration'}, 
				{name: 'selection', label: 'Selection'}, 
				{name: 'styles', label: 'Styles'}, 
				{name: 'menu', label: 'Menu'}, 
				{name: 'dataManipulation', label: 'Data Manipulation'}, 
				{name: 'drag', label: 'Drag & Drop'}, 
				{name: 'keyboard', label: 'Keyboard'}, 
				{name: 'events', label: 'Events'}, 
				{name: 'advanced', label: 'Advanced'}
			];
		
			const frame = BMRectMakeWithOrigin(BMPointMake(
				self.getProperty('_Left') === undefined ? window.innerWidth * .05 | 0 : self.getProperty('_Left'),
				self.getProperty('_Top') === undefined ? window.innerHeight * .05 | 0 : self.getProperty('_Top')
			), {size: BMSizeMake(
				self.getProperty('_Width') === undefined ? window.innerWidth * .9 | 0 : self.getProperty('_Width'),
				self.getProperty('_Height') === undefined ? window.innerHeight * .9 | 0 : self.getProperty('_Height')
			)});
			
			var configurationWindow = (new BMWidgetConfigurationWindow()).initWithURL('../Common/extensions/CollectionView/ui/BMCollectionView/static/assets/config.html?' + Math.random(), {widget: self, sections: sections, frame: frame, completionHandler: function () {
				// Trigger a blocking layout, then post the animation, allowing the renderer enough time to breathe
				/*configurationWindow._window.style.opacity = 0;
				configurationWindow._window.style.display = 'block';
				
				configurationWindow._window.innerWidth;*/
				
				setTimeout(function () {
					configurationWindow.bringToFrontAnimated(YES, {fromNode: button, completionHandler: function () {
						configurationWindow._groupCollectionView.resized();
						// Reflow the page to correct layout mismatches
						document.body.getBoundingClientRect();
					}});
				}, 0);
			}});

			configurationWindow.anchorNode = button;
			
			$(window).on('resize.BMCollectionView', function () {
						
				var frame = BMRectMakeWithOrigin(BMPointMake(
					window.innerWidth * .05 | 0,
					window.innerHeight * .05 | 0
				), {size: BMSizeMake(
					window.innerWidth * .9 | 0,
					window.innerHeight * .9 | 0
				)});
				
				(<any>configurationWindow).frame = frame;
		
            });
            
            configurationWindow.delegate = BMExtend(configurationWindow, {
                DOMNodeForDismissedWindow() {
                    return button;
                },

                windowWillClose(window) {
                    self.configurationWindow = undefined;
					$(window).off('resize.BMCollectionView');
								
					self.setProperty('_Left', window.frame.origin.x);
					self.setProperty('_Top', window.frame.origin.y);
					self.setProperty('_Width', window.frame.size.width);
					self.setProperty('_Height', window.frame.size.height);
                }
            });

			self.configurationWindow = configurationWindow;
			
		});

		const downgradeButton = this.jqElement.find('.BMCollectionViewWidgetDowngradeButton').click(async event => {
			event.stopImmediatePropagation();
			event.stopPropagation();
			event.preventDefault();

			const confirmationPopup = BMConfirmationPopup.confirmationPopupWithTitle('Downgrade to Collection', {
				text: 'This action will downgrade this Collection View to a standard collection.\nSome settings may be lost during the conversion',
				positiveActionText: 'Downgrade',
				negativeActionText: 'Don\'t Downgrade'
			});
			
			if (await confirmationPopup.confirm() == BMConfirmationPopupResult.Confirmed) {
				downgradeButton[0].classList.add('BMCollectionViewWidgetInactiveButton');

				this.jqElement.parent()[0].style.pointerEvents = 'none';

				// It appears that clicking the downgrade button will also cause the widget to be selected (after a delay),
				// which overrides the parent selection so a timeout is used to avoid this
				setTimeout(() => {
					this.parentWidget!.selectWidget();
	
					// A second timeout is used to ensure that the property panel has finished changing
					// This is required because otherwise the new properties object may become corrupted
					setTimeout(() => {
						const message = this.downgradeToCollection();
		
						const alertPopup = BMAlertPopup.alertPopupWithTitle('Downgrade complete', {text: '', actionText: 'Done'});
						alertPopup.HTML = message;
						alertPopup.confirm();
					}, 100);
				}, 100);
				
			}
		});
		
		// Construct the preview collection view
		if (self.collectionView) self.collectionView.release();
		self.collectionView = BMCollectionView.collectionViewForNode(this.jqElement.find('.BMCollectionViewWidgetBorder')[0]);//BMCollectionViewMakeWithContainer(this.jqElement.find('.BMCollectionViewWidgetBorder'), {customScroll: NO});
		
		self.collectionView.layout = this.createLayout();
		self.collectionView.delegate = this;
		
		setTimeout(function () {
			self.collectionView.dataSet = self;
		}, 0);
    }

    beforeDestroy(): void {
		this.collectionView.release();
	}
	
	/**
	 * Downgrades this widget to a built-in collection, providing a report of what could not be migrated.
	 * @return		A message to display to the user indicating the downgrade result.
	 */
	downgradeToCollection(): string {
		let report = '';

		let DisableWrapping = false;
		let MultiSelect = false;
		const props: any = (this as any).properties;

		if (this.getProperty('FlowLayoutMaximumCellsPerRow')) {
			report += '<li style="line-height: 1.5">The <code>FlowLayoutMaximumCellsPerRow</code> property is unsupported and will be set to 0.</li>';
		}

		if (this.getProperty('FlowLayoutOrientation') && this.getProperty('FlowLayoutOrientation') == 'Horizontal') {
			report += '<li style="line-height: 1.5">Flow layout horizontal orientation is unsupported and will be approximated by setting <code>DisableWrapping</code> to true.</li>';
			DisableWrapping = true;
		}

		if (['Start', 'End', 'Left', 'Right'].includes(this.getProperty('FlowLayoutGravity'))) {
			report += `<li style="line-height: 1.5">The <code>${this.getProperty('FlowLayoutGravity')}</code> flow layout gravity is unsupported and will be set to <code>Spaced</code>.</li>`;
			props.FlowLayoutGravity = 'Spaced';
		}

		if (this.getProperty('FlowLayoutContentGravity') == 'Expand') {
			report += '<li style="line-height: 1.5">The <code>Expand</code> flow layout content gravity is unsupported and will be set to <code>Center</code>.</li>';
			props.FlowLayoutContentGravity = 'Center';
		}

		if (['Masonry', 'Tile', 'Stack'].includes(this.getProperty('Layout'))) {
			report += `<li style="line-height: 1.5">The <code>${this.getProperty('Layout')}</code> layout is unsupported and will be set to <code>Flow</code>.</li>`;
			props.Layout = 'Flow';
		}

		if (this.getProperty('AutomaticCellSize')) {
			report += 'The automatic cell size feature is unsupported and will be disabled.\n';
		}

		if (this.getProperty('CellMultipleSelectionType') != 'Disabled') {
			MultiSelect = true;
			if (this.getProperty('CellMultipleSelectionType') != 'CtrlClick') {
				report += `<li style="line-height: 1.5">The multiple selection type <code>${this.getProperty('CellMultipleSelectionType')}</code> is not supported and will be set to <code>CtrlClick</code>.</li>`
			}
		}

		if (this.getProperty('BackgroundStyle')) {
			report += '<li style="line-height: 1.5">The background style property is unsupported and will be removed.</li>';
		}

		if (this.getProperty('ScrollbarStyle') || this.getProperty('ScrollbarTrackStyle')) {
			report += '<li style="line-height: 1.5">Scrollbar styles are unsupported and will be removed.</li>';
		}

		if (this.getProperty('LinkedCollectionView')) {
			report += '<li style="line-height: 1.5">Linked collection views are unsupported and will be disabled.</li>';
		}

		if (this.getProperty('CellSlideMenuType') == 'Popup') {
			report += '<li style="line-height: 1.5">Popup context menus are unsupported and will be converted into slide menus.</li>';
		}

		// Ideally, this should also check for bindings
		if (this.getProperty('CanDragCells') || this.getProperty('CanAcceptCells')) {
			report += '<li style="line-height: 1.5">Drag & drop is not supported and will be disabled.</li>';
		}

		if (this.getProperty('HandlesReponsiveWidgets') || this.getProperty('handlesReponsiveWidgetsImmediately')) {
			report += '<li style="line-height: 1.5">HandlesReponsiveWidgets is unsupported and will be disabled.</li>';
		}

		if (this.getProperty('CellMashupEditingField') || this.getProperty('CellMashupNameEditing')) {
			report += '<li style="line-height: 1.5">Editing states and the editing field are not supported and will be removed.</li>';
		}

		// Prepare the new collection properties
		const newProperties = {
			MultiSelect, 
			DisableWrapping,
			PinsFootersToBottom: this.getProperty('FlowLayoutPinsFootersToContentEdge') || this.getProperty('TableLayoutPinsFootersToContentEdge') || this.getProperty('TileLayoutPinsFootersToContentEdge'),
			PinsHeadersToTop: this.getProperty('FlowLayoutPinsHeadersToContentEdge') || this.getProperty('TableLayoutPinsHeadersToContentEdge') || this.getProperty('TileLayoutPinsHeadersToContentEdge')
		};

		for (const key in BMCollectionViewDowngradeStaticFields) {
			newProperties[key] = BMCollectionViewDowngradeStaticFields[key];
		}

		for (const key in BMCollectionViewDowngradePropertyMap) {
			const collectionFieldName = BMCollectionViewDowngradePropertyMap[key];

			newProperties[collectionFieldName] = props[key];
		}

		for (const key in props) {
			delete props[key];
		}

		BMCopyProperties(props, newProperties);

		if (!report) {
			return 'Your collection view has been downgraded.<br><br>To commit your changes, save your mashup, then close and reopen it.';
		}

		return `Your collection view has been downgraded, but certain properties will no longer be supported.<br><br>Please review the downgrade report below:<br><br><ul style="list-style: disc inside; margin-left: 0; padding-left: 32px;">${report}</ul><br><br>To commit your changes, save your mashup, then close and reopen it.`;

	}

    // #endregion

}

// #endregion

// #region BMCollectionViewMenuController

@TWNamedComposerWidget('CollectionViewMenuController')
export class BMCollectionViewMenuController extends TWComposerWidget {
    widgetIconUrl(): string {
        return require('./images/MenuControllerIcon@2x.png').default;
    }

    widgetProperties(): TWWidgetProperties {
        return <any>{
            name: 'Collection View Menu Controller',
            description: 'When added to a collection view cell mash-up, this widget makes it possible to control the cell menu.',
            category: ['Common'],
			isVisible: !EXTENSION_MODE,
            properties: {
                Width: {
                    defaultValue: 172,
                    baseType: 'NUMBER'
                },
                Height: {
                    defaultValue: 44,
                    baseType: 'NUMBER'
                },
				CellSlideMenu: {
					baseType: 'STATEDEFINITION',
					description: 'If set to a string-based state definition, this will be the cell menu that appears when sliding over the cells. On devices without a touch interface, this menu can be displayed by right-clicking on the cells.',
				},
				_MenuDefinition: {
					baseType: 'STRING',
					isVisible: false,
					defaultValue: '[]'
				}
			}
        };
    }

    afterLoad(): void {
		var properties = (this.allWidgetProperties() as any).properties;
		
		
		// Retrieve the menu definition and generate the events for that menu
		var menuDefinition = JSON.parse(this.getProperty('_MenuDefinition'));
		for (var i = 0; i < menuDefinition.length; i++) {
			properties['Menu:' + menuDefinition[i]] = {
				isBaseProperty: false,
				name: 'Menu:' + menuDefinition[i],
				type: 'service',
				isVisible: true,
				description: 'Dispatches the ' + menuDefinition[i] + ' event on the collection view.'
			};
			properties['Event:' + menuDefinition[i]] = {
				isBaseProperty: false,
				name: 'Event:' + menuDefinition[i],
				type: 'event',
				isVisible: true,
				description: 'Invoked when the ' + menuDefinition[i] + ' menu is selected for this cell.'
			};
		}
		
		// Update the properties UI
		this.updatedProperties();
    }

    private isBuildingServices: boolean = NO;

    widgetServices(): Dictionary<TWWidgetService> {
	    var services = {
			CollapseMenu: {description: "Should be invoked to collapse this cell's menu, if it was opened."},	
			ExpandMenu: {description: "Should be invoked to expand this cell's menu, if it was opened."},	
			ToggleMenu: {description: "Should be invoked to toggle this cell's menu."}	    
		};

		if (this.isBuildingServices) return services;

		this.isBuildingServices = YES;
		
		JSON.parse(this.getProperty('_MenuDefinition')).forEach(function (entry) {
			services['Menu:' + entry] = {description: 'User defined menu entry.'};
		});


		this.isBuildingServices = NO;
		return services;
    }
	
	private isBuildingEvents: boolean = NO;
	widgetEvents(): Dictionary<TWWidgetEvent> {
		var events = {};

		if (this.isBuildingEvents) return events;
		this.isBuildingEvents = YES;
		
		JSON.parse(this.getProperty('_MenuDefinition')).forEach(function (entry) {
			events['Event:' + entry] = {description: 'User defined menu entry.'};
		});

		this.isBuildingEvents = NO;
		return events;
    }
    
    
	
	/**
	 * Will be invoked by the widget after changing the CellSlideMenu property.
	 * Updates the Menu: service list.
	 */
	cellSlideMenuDidChange(): void {
		var properties = (this.allWidgetProperties() as any).properties;
		
		// Retrieve the actual state definition from the platform
		var menuStateDefinition = TW.getStateDefinition(this.getProperty('CellSlideMenu'));
		
		// Delete the previous properties from the previous binding
		var oldDefinition = JSON.parse(this.getProperty('_MenuDefinition'));
		
		for (var i = 0; i < oldDefinition.length; i++) {
			delete properties['Menu:' + oldDefinition[i]];
			delete properties['Event:' + oldDefinition[i]];
		}
		
		if (!(menuStateDefinition = (menuStateDefinition && menuStateDefinition.content && menuStateDefinition.content.stateDefinitions))) {
			// If the state definition is undefined, there is nothing else to do
			return;
		}
		
		// Extract the state names from the menu definition
		var menuDefinition: any[] = [];
		for (var i = 0; i < menuStateDefinition.length; i++) {
			if (menuStateDefinition[i].defaultValue) menuDefinition.push(menuStateDefinition[i].defaultValue);
		}
		
		
		this.setProperty('_MenuDefinition', JSON.stringify(menuDefinition));
		
		// Append the new properties to this widget
		for (var i = 0; i < menuDefinition.length; i++) {
			properties['Menu:' + menuDefinition[i]] = {
				isBaseProperty: false,
				name: 'Menu:' + menuDefinition[i],
				type: 'service',
				isVisible: true,
				description: 'Dispatches the ' + menuDefinition[i] + ' event on the collection view.'
			};
			properties['Event:' + menuDefinition[i]] = {
				isBaseProperty: false,
				name: 'Event:' + menuDefinition[i],
				type: 'event',
				isVisible: true,
				description: 'Invoked when the ' + menuDefinition[i] + ' menu is selected for this cell.'
			};
		}
	
		// Update the properties UI
		this.updatedProperties();
	}
	
	afterSetProperty(name: string, value: any): boolean {
		if (name === 'CellSlideMenu') {
			this.cellSlideMenuDidChange();
		}
        return NO;
    }
	
    renderHtml(): string {
        return '<div class="widget-content BMCollectionViewMenuController">Collection View Menu Controller</div>';
    }

    afterRender() {

    }

    beforeDestroy() {

    }

}

// #endregion

// #region BMCollectionViewSelectionController

@TWNamedComposerWidget('CollectionViewSelectionController')
export class BMCollectionViewSelectionController extends TWComposerWidget {
    widgetIconUrl(): string {
        return require('./images/SelectionControllerIcon@2x.png').default;
    }

    widgetProperties(): TWWidgetProperties {
        return <any>{
            name: 'Collection View Selection Controller',
            description: 'When added to a collection view cell mash-up, this widget makes it possible to control the cell\'s selection.',
			category: ['Common'],
			isVisible: !EXTENSION_MODE,
            properties: {
                Width: {
                    defaultValue: 184,
                    baseType: 'NUMBER'
                },
                Height: {
                    defaultValue: 44,
                    baseType: 'NUMBER'
                }
			}
        };
    }

    widgetServices(): Dictionary<TWWidgetService> {
	    return {
			DeselectCell: {description: "Should be invoked to deselect this cell, if it was selected."},	
			SelectCell: {description: "Should be invoked to select this cell, if it was deselected."},	
			ToggleSelection: {description: "Should be invoked to toggle this cell's selection."}	    
	    };
    }
	
	private isBuildingEvents: boolean = NO;
	widgetEvents(): Dictionary<TWWidgetEvent> {
		return {};
    }
    
    renderHtml(): string {
        return '<div class="widget-content BMCollectionViewSelectionController">Collection View Selection Controller</div>';
    }

    afterRender() {

    }

    beforeDestroy() {

    }

}

// #endregion


// #region BMCollectionViewEditingController

@TWNamedComposerWidget('CollectionViewEditingController')
export class BMCollectionViewEditingController extends TWComposerWidget {
    widgetIconUrl(): string {
        return require('./images/EditingControllerIcon@2x.png').default;
    }

    widgetProperties(): TWWidgetProperties {
        return <any>{
            name: 'Collection View Editing Controller',
            description: 'When added to a collection view cell mash-up, this widget makes it possible to control the cell\'s editing state.',
            category: ['Common'],
			isVisible: !EXTENSION_MODE,
            properties: {
                Width: {
                    defaultValue: 184,
                    baseType: 'NUMBER'
                },
                Height: {
                    defaultValue: 44,
                    baseType: 'NUMBER'
                }
			}
        };
    }

    widgetServices(): Dictionary<TWWidgetService> {
	    return {
			BeginEditing: {description: "Begins editing the object associated with this cell."},	
			FinishEditing: {description: "Finishes editing the object associated with this cell."}
	    };
    }
	
	widgetEvents(): Dictionary<TWWidgetEvent> {
		return {};
    }
    
    renderHtml(): string {
        return '<div class="widget-content BMCollectionViewEditingController">Collection View Editing Controller</div>';
    }

    afterRender() {

    }

    beforeDestroy() {

    }

}

// #endregion

