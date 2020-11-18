///<reference path="../node_modules/bm-core-ui/lib/@types/BMCoreUI.min.d.ts"/>
///<reference types="velocity-animate"/>

import { TWNamedRuntimeWidget, TWService, TWProperty } from 'typescriptwebpacksupport/widgetruntimesupport';

enum BMCollectionViewWidgetSlideMenuType {
	Auto = 'Auto',
	Slide = 'Slide',
	Popup = 'Popup'
}

declare var self: never;

declare class DataManager extends TWDataManager {};

declare var Encoder: any;

// This flag controls whether the new features that require BMCollectionViewCell to subclass BMView should be enabled
const USE_BMVIEW_SUBCLASS: boolean = YES;

/**
 * Represents the serial number for each mashup created for this collection view.
 * This number is used to guarantee a unique ID for these mashups.
 */
let BMCollectionViewWidgetSerialVersion: number = 0;

declare global {
	interface Window {
		BMCollectionViewMashupDefinitionCacheWipe(): void;
		BMCollectionViewMashupDefinitionCache: Dictionary<BMCollectionViewDeserializedMashupEntityDefinition>;
	}
}

/**
 * The mashup definition cache holds the JSON representation of each mashup type after they are loaded into a collection view for the first time.
 * When the collection view needs to create a mashup of the same type as one that was already cached, it can load its definition from this object
 * and avoid sending another HTTP request to retrieve it.
 */
var BMCollectionViewMashupDefinitionCache: Dictionary<BMCollectionViewDeserializedMashupEntityDefinition> = {};
window.BMCollectionViewMashupDefinitionCache = BMCollectionViewMashupDefinitionCache;

/**
 * A dictionary containing pending requests for mashup definitions.
 */
var BMCollectionViewMashupDefinitionRequests: Dictionary<BMXMLHttpRequest> = {};

// TW.encodeEntityName is not available in older versions of Thingworx
// In those versions it is filled in by a basic function that returns its input back as the result
TW.encodeEntityName = TW.encodeEntityName || function (string) { return string; };

/**
* Contains the options for multiple selection.
*/
export let BMCollectionViewCellMultipleSelectionType = Object.freeze({
   /**
    * Indicates that multiple selection is disabled.
    */
   Disabled: {},

   /**
    * Indicates that clicking on any unselected cell will cause it to be added to the selection,
    * while clicking on any unselected cell will cause it to be removed from the selection.
    */
   ClickTap: {},

   /**
    * Indicates that multiple selection will be disabled until the selection mode is enabled.
    * While the selection mode is enabled, multiple selection will work as if the ClickTap option was used.
    * When the selection mode is disabled, the current selection is cleared.
    */
   SelectionMode: {},

   /**
    * Indicates that multiple selection will only work when clicking cells while holding ctrl or cmd.
    * Using this option on touch devices will disable multiple selection.
    */
   CtrlClick: {}
});

(window as any).BMCollectionViewCellMultipleSelectionType = BMCollectionViewCellMultipleSelectionType;

// #region Private Definitions

declare function BMDirectLinkConnectWithDelegate(delegate: any);
declare function BMDirectLinkDisconnectWithDelegate(delegate: any);

export declare interface BMCollectionViewUpdatePropertyInfo extends TWUpdatePropertyInfo {
    ForceUpdateLayout?: boolean;
}

/**
 * The interface for an XMLHttpRequest that is modified when requesting mashup definitions from Thingworx.
 */
export declare interface BMXMLHttpRequest extends XMLHttpRequest {
    _BMCallbackCollection: any;
    _BMPromise: Promise<TWMashupEntityDefinition>;
}

/**
 * The interface for a mashup entity whose content has been deserialized.
 */
export declare interface BMCollectionViewDeserializedMashupEntityDefinition extends TWMashupEntityDefinition {

    /**
     * The deserialized content of this mashup.
     */
    _BMDeserializedContent?: TWMashupDefinition;
}

/**
 * The interface for a mashup that was created by a collection view.
 */
export declare interface BMCollectionViewMashup extends TWMashup {

    /**
     * Invoked to set the value of the given property to the given value.
     * This does not notify the cell owning this mashup of the change.
     * @param key The name of the property.
     * @param value The new value to assign to the property.
     */
    BM_setParameterInternal(key: string, value: any): void;
    
    /**
     * The cell managing this mashup's lifecycle.
     */
    _BMCell: BMCollectionViewMashupCell;

    /**
     * The collection view containing this mashup's cell.
     */
    _BMCollectionView: BMManagedCollectionView;

    /**
     * The widget managing the collection view containing this mashup's cell.
     */
    _BMCollectionViewController: BMCollectionViewWidget;

    /**
     * The menu controller widget within this mashup, if it exists.
     */
	_BMCollectionViewMenuController?: BMCollectionViewMenuController;
	
	/**
	 * A view which is created for the mashup when its root widget is a `BMView` widget.
	 */
	_BMView?: BMMashupView;

    /**
     * An optional delegate object that may receive various callbacks related to the
     * lifecycle of this mashup and the cell managing it.
     */
    BMCellDelegate?: any;

}

/**
 * An subclass of collection view used by the collection view widget.
 */
export declare class BMManagedCollectionView extends BMCollectionView {

    /**
     * Represents the collection view widget managing this collection view.
     */
    controller: BMCollectionViewWidget;

    /**
     * Set to `YES` while the collection view is updating data.
     */
    isUpdatingData: boolean;

}

export interface TWRuntimeWidgetPrivate extends TWRuntimeWidget {

	properties: any;

	jqElementId: string;

	runtimeProperties(): any;

	idOfThisMashup: string;

	idOfThisElement: string;

	propertyAttributes: any;

	containerInfo: any;

	renderStyles?(): any;

	getWidgets(): TWRuntimeWidgetPrivate[];

	appendTo(widgetElement: $, mashup: BMCollectionViewMashup);
	appendTo(widgetElement: $, mashup: BMCollectionViewMashup, fastWidgetAppend: boolean);

	afterWidgetsRendered?(): void;

	lastSelectionUpdateCount?: number;

}

// #endregion

// #region Mashup Cell

/**
 * Wipes the mashup definition cache, requiring collection view to reload the mashup definitions when rendering cells.
 */
export function BMCollectionViewMashupDefinitionCacheWipe() {
	BMCollectionViewMashupDefinitionCache = {};
}


window.BMCollectionViewMashupDefinitionCacheWipe = BMCollectionViewMashupDefinitionCacheWipe;

/**
 * Retrieves and caches the definition for the given mashup.
 * If the mashup definition is already cached, it is returned synchronously.
 * If this mashup definition is requested asynchronously while there is already a pending request for this mashup,
 * a new request will not be created. Instead, the completion handler will be added to the already existing request.
 * @param name <String>																				The name of the mashup whose definition to retrieve.
 * {
 * 	@param atomic <Boolean, nullable>																Defaults to YES for compatibility. If set to YES, the request will be synchronous, otherwise it will by asynchronous.
 * 																									It is recommended to set this argument to NO due to synchronous requests' detrimental
 * 																									effects to user experience.
 *  @param completionHandler <void ^(nullable TWMashupDefinition, nullable error), nullable>		A completion handler to invoke when the mashup definition was retrieved or an error occurs.
 * 																									The handler returns nothing and receives two parameters:
 * 																										- The mashup definition if it could be retrieved
 * 																										- The error if the mashup definition could not be retrieved
 * }
 * @return <TWMashupDefinition, nullable OR Promise>												The mashup definition if the request was atomic and it could be retrieved,
 * 																									undefined otherwise. 
 * 																									If the request is nonatomic, this function will return a promise that resolves when the request completes.
 */
function BMCollectionViewDefinitionForMashupNamed(name: string, args?: {atomic?: boolean, completionHandler?: (mashup?: (BMCollectionViewDeserializedMashupEntityDefinition | undefined), error?: (Error | undefined)) => void}): BMCollectionViewDeserializedMashupEntityDefinition | Promise<BMCollectionViewDeserializedMashupEntityDefinition> {
	args = args || {};
	if (args.atomic === undefined) args.atomic = YES;

	// Return the cached definition if it is already available
	if (BMCollectionViewMashupDefinitionCache[name]) {
		if (args.completionHandler) {
			args.completionHandler(BMCollectionViewMashupDefinitionCache[name]);
		}

		return BMCollectionViewMashupDefinitionCache[name];
	}

	var request;
	var promise;

	// Otherwise create a request for this mashup and make it available globally
	if (args.atomic) {
		// Atomic requests are not added to the global requests, because they execute synchronously and no other request may be started
		// while this one is executing
		// Promises are also not created for atomic requests.
		request = new XMLHttpRequest();
	}
	else if (!BMCollectionViewMashupDefinitionRequests[name]) {
		// If the request is nonatomic and there isn't already a pending request, create it now
		request = new XMLHttpRequest();
		BMCollectionViewMashupDefinitionRequests[name] = request;

		// Wrap the callback in a callback collection to allow multiple requests to the same mashup to execute together
		request._BMCallbackCollection = BMFunctionCollectionMake();

		// Create a promise that will be returned by this function, allowing this function to be awaited for in async functions
		request._BMPromise = new Promise(function (resolve, reject) {
			request._BMResolve = resolve;
			request._BMReject = reject;
		});
		promise = request._BMPromise;

		// Push the callback into the callback collection
		if (args.completionHandler) {
			request._BMCallbackCollection.push(args.completionHandler);
		}
	}
	else {
		// If there is already a pending request for this mashup, just add the completion handler
		// to that request's completion handler collection,
		// except for atomic requests which should be allowed to continue normally
		if (args.completionHandler) BMCollectionViewMashupDefinitionRequests[name]._BMCallbackCollection.push(args.completionHandler);
		// Also return the already existing promise
		return BMCollectionViewMashupDefinitionRequests[name]._BMPromise;
	}
	
	request.open('GET', "/Thingworx/Mashups/" + TW.encodeEntityName(name), !args.atomic);
	
	request.setRequestHeader('Content-Type', 'application/json');
	request.setRequestHeader('Accept', 'application/json');
	request.setRequestHeader('x-thingworx-session', 'true');
	
	// This will hold the actual mashup object once the XHR finishes loading
	var mashupDefinition;
	
	request.onload = function (data) {
		if (this.status == 200) {
			mashupDefinition = JSON.parse(request.responseText);
			// Cache the mashup definition
			BMCollectionViewMashupDefinitionCache[name] = mashupDefinition;
			
			// Then invoke the completion handler
			this._BMCallbackCollection(mashupDefinition);

			// Resolve the promise
			this._BMResolve && this._BMResolve(mashupDefinition);
			/*if (args.completionHandler) {
				args.completionHandler(mashupDefinition);
			}*/
		}
		else {
			var error = new Error('The mashup could not be loaded. The server returned status code ' + this.status);
			this._BMCallbackCollection(undefined, error);
			this._BMReject && this._BMReject(error);

			/*if (args.completionHandler) {
				args.completionHandler(undefined, new Error('The mashup could not be loaded. The server returned status code ' + this.status));
			}*/
		}
	};
	
	request.onerror = function (error) {
		TW.Runtime.showStatusText('permission-error', 'Could not load "' + Encoder.htmlEncode(name) + '". Reason: ' + request.status + ' - ' + request.responseText, true);
		this._BMCallbackCollection(undefined, error);
		this._BMReject && this._BMReject(error);

		/*if (args.completionHandler) {
			args.completionHandler(undefined, eror);
		}*/
	};
	
	request.send();
	return args.atomic ? mashupDefinition : promise;
}

/**
 * A view subclass that manages the DOMNode associated with a mashup root widget
 */
export class BMMashupView extends BMView {

	protected _contentNode!: DOMNode;

	get _supportsAutomaticIntrinsicSize(): boolean {return NO}

	// @override - BMView
	get contentNode() {
		return this._contentNode || this.node;
	}

	/**
	 * Constructs and returns a mashup view for the given mashup.
	 * @param mashup		The mashup.
	 * @return				A mashup view.
	 */
	static viewForMashup(mashup: TWMashup): BMMashupView {
		let view: BMMashupView = BMView.viewForNode.call(this, mashup.rootWidget.boundingBox[0]) as BMMashupView;

		view._contentNode = mashup.rootWidget.jqElement[0];

		return view;
	}

}

/**
 * This class implements a collection view cell that creates and manages a mashup.
 * It manages the lifecycle of the mashup, destroying and creating mashups as needed and controlling its parameters.
 */
export class BMCollectionViewMashupCell extends BMCollectionViewCell {

    /**
     * Set to `YES` after collection view widget has fully initialized this cell.
     */
    initialized: boolean = NO;

    /**
     * Set to `YES` while this cell is unbound.
     */
    BM_recycled: boolean = NO;

    /**
     * Set to `YES` while this cell is hosting the collection view menu.
     */
	BM_hasMenu: boolean = NO;
	
	private _contentNode?: DOMNode;

	get contentNode() {
		return this._contentNode || this.node;
	}

    /**
     * The collection view managing this mashup cell's lifecycle.
     */
    collectionView!: BMManagedCollectionView;

    /**
     * The name of the animation queue used by Collection View Mashup Cell when animating the background color of cells.
     */
    static BackgroundColorQueue: string = 'BMCollectionViewMashupCellSelectionQueue';

	/**
	 * The name of the mashup managed by this mashup cell.
	 */
    private _mashup?: string;
    
	/**
	 * The name of the mashup managed by this mashup cell.
	 */
	get mashup(): string | undefined {
		return this._mashup;
	}
	set mashup(mashup: string | undefined) {
		// Ignore undefined assignments
		if (!mashup) return;

		if (mashup != this._mashup) {
			if (this.itemType == BMCollectionViewLayoutAttributesType.Cell) this.reuseIdentifier = mashup;
			this._mashup = mashup;
			this._loadMashup();
		}
	}

	/**
	 * The mashup definition for the currently loaded mashup.
	 */
	private _mashupDefinition?: TWMashupEntityDefinition;

	/**
	 * A property that temporarily holds an old mashup instance during an animated mashup change.
	 */
	private _previousMashupInstance?: BMCollectionViewMashup;

	/**
	 * The mashup instance managed by this mashup cell.
	 */
	_mashupInstance?: BMCollectionViewMashup;

	/**
	 * The mashup instance managed by this mashup cell.
	 */
	get mashupInstance(): TWMashup | undefined {
		return this._mashupInstance;
	}

	/**
	 * An object containing the parameter values that will be passed to the mashup.
	 * The mashup cell will retain a strong reference to this object.
	 * If any of the mashup's widgets or services bind back to the mashup's parameters,
	 * the mashup cell will modify this object.
	 */
    private _parameters: any;
    

	/**
	 * An object containing the parameter values that will be passed to the mashup.
	 * The mashup cell will retain a strong reference to this object.
	 * If any of the mashup's widgets or services bind back to the mashup's parameters,
	 * the mashup cell will modify this object.
	 */
	get parameters(): any {
		return this._parameters;
	}
	set parameters(parameters: any) {
		this._parameters = parameters;
		this._setParametersInternal();
	}

	/**
	 * An object containing the global parameter values that will be passed to the mashup.
	 * The mashup cell will retain a strong reference to this object.
	 * If any of the mashup's widgets or services bind back to the mashup's parameters,
	 * the mashup cell will modify this object.
	 */
    _globalParameters: any;
    
	/**
	 * An object containing the global parameter values that will be passed to the mashup.
	 * The mashup cell will retain a strong reference to this object.
	 * If any of the mashup's widgets or services bind back to the mashup's parameters,
	 * the mashup cell will modify this object.
	 */
	get globalParameters(): any {
		return this._globalParameters;
	}
	set globalParameters(globalParameters: any) {
		this._globalParameters = globalParameters;
		this._setGlobalParametersInternal();
	}

	/**
	 * The CSS name of the pointer icon to use for the mouse when hovering over this cell.
	 */
    private _pointer: string = 'default';

	/**
	 * The CSS name of the pointer icon to use for the mouse when hovering over this cell.
	 */
	get pointer(): string {
		return this._pointer;
	}
	set pointer(pointer: string) {
		this._pointer = pointer;
		this.node.style.cursor = pointer;
	}

	/**
	 * The background color to use for this cell.
	 */
    _backgroundColor: BMColor = BMColorMake();

	/**
	 * The background color to use for this cell.
	 */
	get backgroundColor(): BMColor {
		return this._backgroundColor;
	}
	set backgroundColor(backgroundColor: BMColor) {
		var currentColor = this._backgroundColor;
		this._backgroundColor = backgroundColor.copy();
		this._updateBackgroundColorFromColor(currentColor);
    }
    
    /**
     * Set to `YES` while this cell is updating its background color through an animation.
     */
    private _isUpdatingColor: boolean = NO;

	/**
	 * Updates the DOM element managed by this cell to use the cell's background color.
	 * If this cell is visible on screen, this change is animated
	 */
	_updateBackgroundColorFromColor(color) {
		var toColor = this._backgroundColor;
		if (this.isRetained) {
			// Stop the current color animation if one is running
			if (this._isUpdatingColor) {
				$.Velocity(this.node, "stop", BMCollectionViewMashupCell.BackgroundColorQueue);
			}

			this._isUpdatingColor = YES;
			var self = this;
			$.Velocity(this.node, {tween: 1}, {duration: 200, progress(elements, complete) {
				self.node.style.backgroundColor = BMColorByInterpolatingRGBAColor(color, {toColor: toColor, withFraction: complete}).RGBAString;
			}, queue: BMCollectionViewMashupCell.BackgroundColorQueue, complete() {
				self._isUpdatingColor = NO;
			}});
			$.Velocity.Utilities.dequeue(this.node, BMCollectionViewMashupCell.BackgroundColorQueue);
		}
		else {
			this.node.style.backgroundColor = this._backgroundColor.RGBAString;
		}
	}

	/**
	 * A dictionary containing the mapping between infotable field names and mashup parameter names.
	 * This object should have the infotable field names as keys and their corresponding parameter names as values.
	 */
	_parameterMap: Dictionary<string> = {};

	/**
	 * The widget managing this cell's collection view.
	 */
	get controller(): BMCollectionViewWidget {
		return this.collectionView.controller;
	}

	/**
	 * Invoked internally by the mashup cell to update the managed mashup's parameters
	 * to the values currently used by the cell.
	 */
	_setParametersInternal(): void {

		var mashup = this._mashupInstance;
		if (mashup && this._parameters) {
			for (var parameter in this._parameterMap) {
				if (parameter == '@row') {
					// The special '@row' parameter maps the entire infotable row
					const dataShape = this.collectionView.controller.dataShape;
					const table = {dataShape, rows: [this._parameters]};
					mashup.BM_setParameterInternal(this._parameterMap[parameter], table);
					continue;
				}
				mashup.BM_setParameterInternal(this._parameterMap[parameter], this._parameters[parameter]);
			}
			
			
			// Run a layout pass if the root widget is a BMView
			let rootWidget = mashup.rootWidget.getWidgets()[0] as any;

			// Trigger a blocking layout pass
			if (rootWidget && rootWidget.coreUIView) {
				//rootWidget.coreUIView.layout();
			}
		}
	}

	/**
	 * Invoked internally by the mashup cell to update the managed mashup's global parameters
	 * to the values currently used by the cell.
	 */
	_setGlobalParametersInternal(): void {
		var mashup = this._mashupInstance;
		if (mashup) Object.getOwnPropertyNames(this._globalParameters).forEach(parameter => {
            mashup!.BM_setParameterInternal(parameter, this._globalParameters[parameter]);
        });
	}

	/**
	 * The mashup parameter name that holds the selected state.
	 */
	_selectedParameter?: string = undefined; // <String>

	/**
	 * The value of the mashup selected parameter.
	 */
    _isSelected: boolean = NO;

	/**
	 * The value of the mashup selected parameter.
	 */
	get isSelected(): boolean {
		return this._isSelected;
	}
	set isSelected(selected: boolean) {
		if (this._isSelected != selected) {
            this._isSelected = selected;

            if (this.node) {
                if (selected) {
                    this.node.classList.add('BMCollectionViewCellSelected');
                }
                else {
                    this.node.classList.remove('BMCollectionViewCellSelected');
                }
            }
            
			this._setSelectedParameterInternal();
		}
	}

	/**
	 * Invoked internally by the mashup cell to update the managed mashup's selected parameter;
	 */
	_setSelectedParameterInternal(): void {
		if (this._selectedParameter && this._mashupInstance) {
			this._mashupInstance.BM_setParameterInternal(this._selectedParameter, this._isSelected);
		}
	}


	/**
	 * The mashup parameter name that holds the editing state.
	 */
	_editingParameter?: string = undefined;

	/**
	 * The value of the mashup editing parameter.
	 */
	_isEditing: boolean = NO;

	/**
	 * The value of the mashup editing parameter.
	 */
	get isEditing(): boolean {
		return this._isEditing;
	}
	set isEditing(editing: boolean) {
		if (this._isEditing != editing) {
            this._isEditing = editing;
            

            if (this.node) {
                if (editing) {
                    this.node.classList.add('BMCollectionViewCellEditing');
                }
                else {
                    this.node.classList.remove('BMCollectionViewCellEditing');
                }
            }

			this._setEditingParameterInternal();
		}
	}

	/**
	 * Invoked internally by the mashup cell to update the managed mashup's editing parameter;
	 */
	_setEditingParameterInternal() {
		if (this._editingParameter && this._mashupInstance) {
			this._mashupInstance.BM_setParameterInternal(this._editingParameter, this._isEditing);
		}
	};

	/**
	 * The color to use for the ripple.
	 */
    _rippleColor: BMColor = BMColorMake();

	/**
	 * The color to use for the ripple.
	 */
	get rippleColor() {
		return this._rippleColor;
	}
	set rippleColor(rippleColor) {
		this._rippleColor = rippleColor || BMColorMake();
		if (this._ripple) this._ripple[0].style.backgroundColor = this._rippleColor.RGBAString;
	}

	/**
	 * The ripple jQuery element if ripples are used.
	 */
	_ripple?: $ = undefined;

	/**
	 * Controls whether or not this cell uses a ripple effect when it is clicked.
	 */
	get usesRipple(): boolean {
		return !!this._ripple;
	}
	set usesRipple(usesRipple: boolean) {
		if (usesRipple) {
			if (this._ripple) return;

			this._ripple = BMRippleMakeForTarget($(this.node), {withColor: this._rippleColor.RGBAString});
		}
		else {
			if (this._ripple) this._ripple.remove() && (this._ripple = undefined);
		}
	}

	// @override - BMCollectionViewCell
	initWithCollectionView(collectionView: BMCollectionView, args: {reuseIdentifier: string, node: DOMNode}): BMCollectionViewMashupCell {
		super.initWithCollectionView(collectionView, args);

		this.node.classList.add('BMCollectionViewCellWrapper');

		return this;
	}

	/**
	 * Invoked internally to load and render the mashup that will be managed by this cell.
	 * If the mashup definition is not in the mashup cache, the cell will perform an asynchronous request
	 * to retrieve the mashup's definition.
	 */
	private _loadMashup(): void {
		let definition;
		var self = this;

		// If mashup is undefined, there is nothing to load
		if (!this._mashup) return;

		if (BMCollectionViewMashupDefinitionCache[this._mashup]) {
			definition = BMCollectionViewMashupDefinitionCache[this._mashup];
			self._renderMashupNamed(this._mashup, {withDefinition: definition});
		}
		else {
			var mashup = this._mashup;
			BMCollectionViewDefinitionForMashupNamed(this._mashup, {atomic: NO, completionHandler: function (definition, error) {
				if (definition) self._renderMashupNamed(mashup, {withDefinition: definition});
			}});
		}
	}

	/**
	 * @override - BMCollectionViewCell
	 * Invoked by the collection view before this cell becomes bound to a data set object.
	 * Causes the mashup cell to render its mashup if its definition was retrieved and it was not previously rendered/
	 */
	prepareForDisplay(): void {
		BMCollectionViewCell.prototype.prepareForDisplay.call(this);
		if (this._awaitsRendering) {
			this._awaitsRendering = NO;
			if (this._mashupDefinition) {
				this._renderMashupNamed(this._mashup!, {withDefinition: this._mashupDefinition});
			}
		}


	}

	/**
	 * @override - BMCollectionViewCell
	 * Prepares this mashup cell for being reused.
	 * Stops all running animations managed by this mashup cell.
	 */
	prepareForReuse(): void {
		BMCollectionViewCell.prototype.prepareForReuse.call(this);
		if (this._isUpdatingColor) {
			$.Velocity(this.node, "finish", BMCollectionViewMashupCell.BackgroundColorQueue);
			this.node.style.backgroundColor = this.backgroundColor.RGBAString;
		}
	}

	/**
	 * @override - BMCollectionViewCell
	 * Destroys the mashup instance managed by this cell.
	 */
	destroy(): void {
		this._mashup = undefined;
		if (this._mashupInstance) try {
			this._mashupInstance.destroyMashup();
		}
		catch (err) {
			console.log('CollectionView was unable to destroy the mashup associated with the cell at index path ' + this.indexPath);
			console.log(err);	
        }
        
        super.destroy();
	}

	// @override - BMCollectionViewCell
	boundsWillChangeToBounds(bounds: BMRect): void {
		/*
		// When the change is animated and the mashup's root widget is a BMView, run an animated layout update
		if (BMAnimationContextGetCurrent()) {
			if (this._mashupInstance && this._mashupInstance.rootWidget.getWidgets().length) {
				let rootWidget = this._mashupInstance.rootWidget.getWidgets()[0] as any;

				// Trigger a blocking layout pass
				if (rootWidget.coreUIView) {
					this._mashupInstance.rootWidget.jqElement.css({width: bounds.size.width + 'px', height: bounds.size.height + 'px'});
					rootWidget.coreUIView.layout();
					this._mashupInstance.rootWidget.jqElement.css({width: '100%', height: '100%'});
				}
			}
		}
		*/
	}

	// @override - BMCollectionViewCell
	boundsDidTransitionToBounds(bounds: BMRect): void {
		if (this._mashupInstance && this.controller.getProperty('HandlesResponsiveWidgetsImmediately')) {
			this._mashupInstance.rootWidget.handleResponsiveWidgets(YES);
		}
	}

	// @override - BMCollectionViewCell
	boundsDidChangeFromBounds(bounds: BMRect): void{
		if (this._mashupInstance && this.controller.getProperty('HandlesResponsiveWidgets')) {
			this._mashupInstance.rootWidget.handleResponsiveWidgets(YES);
		}
	}

    //#region Mashup Rendering
    
    /**
     * Set to `YES` while this cell is awaiting for a request in order to render a mashup.
     */
	private _awaitsRendering: boolean = NO;
	
	/**
	 * Set to `YES` when this cell is about to run an animated mashup update.
	 */
	private _awaitsMashupUpdate: boolean = NO;

	/**
	 * Causes this cell to render and display the given mashup, if it corresponds to the mashup that this cell manages,
	 * otherwise this method does nothing.
	 * If this cell is already managing a mashup when this method is invoked, that mashup will be destroyed before the new one is created.
	 * If this cell is in a recycled state when this method is invoked, mashup rendering will be deferred to <code>prepareForDisplay()</code>
	 * @param named <String>							The name of the mashup to render.
	 * {
	 * 	@param withDefinition <TWMashupDefinition>		The mashup definition object.
	 * }
	 */
	_renderMashupNamed(named: string, args: {withDefinition: TWMashupEntityDefinition}) {
		// Don't do anything if this mashup no longer corresponds to this cell's mashup
		if (named != this._mashup) return;

		this._mashupDefinition = args.withDefinition;
		let definition = args.withDefinition;

		// Destroy the current mashup if there is one
		if (this._mashupInstance) {
			this._previousMashupInstance = this._mashupInstance;
			//this._mashupInstance.destroyMashup();
		}

		// If the cell is not visible, wait until it becomes bound to an object before
		// rendering the mashup
		if (!this.isRetained) {
			this._awaitsRendering = YES;
			this._mashupInstance = undefined;
			return;
		}

		var self = this;

		// Save a reference to the currently loaded mashup and its HTML ID so it can be restored afterwards
		var currentHTMLID = TW.Runtime.HtmlIdOfCurrentlyLoadedMashup;
		var currentMashup = TW.Runtime.Workspace.Mashups.Current;
		
		// A new container has to be created for the mashup
		// because it gets removed when the mashup is destroyed
		var containerNode: HTMLDivElement = document.createElement('div');
		containerNode.classList.add('BMCollectionViewCell', 'BMCollectionViewCellHoverable');
		this.node.appendChild(containerNode);
		var container: $ = $(containerNode);

		this._contentNode = containerNode;

		// If there was a previous mashup that should be destroyed,
		// the new mashup starts out transparent
		if (this._previousMashupInstance) {
			containerNode.style.opacity = '.0000';
		}
		
		// Increment the mashup serial version to generate a unique ID for this mashup
		BMCollectionViewWidgetSerialVersion++;
		
		var mashupContent = definition.mashupContent;
		
		// Construct the mashup object and its associated data object
		var mashup = new TW.MashupDefinition() as BMCollectionViewMashup;
		this._mashupInstance = mashup;
		
		mashup.dataMgr = new DataManager() as TWDataManager;
		
		// Set up the unique IDs
		// Replace dots with underscores so they don't throw off the jQuery selectors used by Thingworx
		mashup.rootName = definition.name.replace(/\./g, '_') + '-' + BMCollectionViewWidgetSerialVersion;
		container.attr('id', mashup.rootName);
		mashup.htmlIdOfMashup = '#' + mashup.rootName;
		TW.Runtime.HtmlIdOfCurrentlyLoadedMashup = mashup.htmlIdOfMashup;
		
		mashup.mashupName = definition.name;
		
		// Trigger the mashup load
		mashup.loadFromJSON(mashupContent, definition);
		
		// Construct the bindings
		mashup.dataMgr.migrateAnyBindings(mashup);
		TW.Runtime.Workspace.Mashups.Current = mashup;
		
		if (USE_BMVIEW_SUBCLASS) {

			// If the root widget of the new mashup is a view, attach it as a subview of the cell
			let rootWidget = this._mashupInstance.rootWidget.getWidgets()[0] as any;

			// Prevent the root view from initiating a layout pass before this cell is ready for display
			if (rootWidget && rootWidget.coreUIView) {
				rootWidget._skipInitialLayoutPass = YES;
			}

		}
		
		// Use fast widget append if enabled
		if (self.controller.getProperty('[Experimental] Fast widget append')) {
			self._fastWidgetAppend.call(mashup.rootWidget as TWRuntimeWidgetPrivate, container, mashup);
		}
		else {		
			// Otherwise draw the mashup into the container using the standard Thingworx method
			mashup.rootWidget.appendTo(container, mashup);
		}

		// Create the data manager
		mashup.dataMgr.loadFromMashup(mashup);

		// Set to YES if this mashup update is part of an animated transition
		let performsMashupTransition = NO;
		let mashupRootView: BMView | undefined;

		// #FLAG
		if (USE_BMVIEW_SUBCLASS) {

			// If the root widget of the new mashup is a view, attach it as a subview of the cell
			let rootWidget = this._mashupInstance.rootWidget.getWidgets()[0] as any;

			// Create a view for the mashup widget and add the root view as a sub-widget
			if (rootWidget && rootWidget.coreUIView) {
				let mashupView: BMMashupView = BMMashupView.viewForMashup(mashup);
				mashup._BMView = mashupView;
				this.addSubview(mashupView, {toPosition: 0});

				let rootView: BMView = rootWidget.coreUIView;
				mashupView.addSubview(rootView);

				// Additionally, the root widget is to be added a subview to the mashup view with a set of constraints
				BMLayoutConstraint.constraintWithView(rootView, {attribute: BMLayoutAttribute.Left}).isActive = YES;
				BMLayoutConstraint.constraintWithView(rootView, {attribute: BMLayoutAttribute.Top}).isActive = YES;
				BMLayoutConstraint.constraintWithView(rootView, {attribute: BMLayoutAttribute.Width, toView: mashupView, relatedBy: BMLayoutConstraintRelation.Equals, secondAttribute: BMLayoutAttribute.Width}).isActive = YES;
				BMLayoutConstraint.constraintWithView(rootView, {attribute: BMLayoutAttribute.Height, toView: mashupView, relatedBy: BMLayoutConstraintRelation.Equals, secondAttribute: BMLayoutAttribute.Height}).isActive = YES;

				// Similarly, the mashup root widget has to be linked to the cell
				BMLayoutConstraint.constraintWithView(mashupView, {attribute: BMLayoutAttribute.Left}).isActive = YES;
				BMLayoutConstraint.constraintWithView(mashupView, {attribute: BMLayoutAttribute.Top}).isActive = YES;
				BMLayoutConstraint.constraintWithView(mashupView, {attribute: BMLayoutAttribute.Width, toView: this, relatedBy: BMLayoutConstraintRelation.Equals, secondAttribute: BMLayoutAttribute.Width}).isActive = YES;
				BMLayoutConstraint.constraintWithView(mashupView, {attribute: BMLayoutAttribute.Height, toView: this, relatedBy: BMLayoutConstraintRelation.Equals, secondAttribute: BMLayoutAttribute.Height}).isActive = YES;

	
				if (this._previousMashupInstance && this._previousMashupInstance._BMView) {
					// If this mashup switch happens during a data update, run a smooth transition between individual subviews
					if (this.collectionView.isUpdatingData) {
						performsMashupTransition = YES;
						mashupRootView = rootView;
					}
				}

			}

		}

		// Bring ripple back to front
		if (this._ripple) this.node.appendChild(this._ripple[0]);
		
		(mashup as any).parameterDefinitions = (definition as any).parameterDefinitions;
		
		mashup._BMCell = this;
		mashup._BMCollectionView = this.collectionView;
		mashup._BMCollectionViewController = this.controller;
		
		// Store a reference to this mashup in the container's data dictionary
		container.data('mashup', mashup);

		// Add a hook into setParameter, to allow data updates; set this up after providing the initial values to parameters
		mashup.BM_setParameterInternal = mashup.setParameter;
		mashup.setParameter = function (key, value) {
			// Allow the mashup to update the parameter internally
			this.BM_setParameterInternal(key, value);
			
			// Don't publish changes originating from unbound cells
			if (!self.isRetained) return;
			//if (this._BMCell.BM_recycled) return;

			// Don't publish changes to the selected or editing parameter
			if (key == self._selectedParameter) return;
			if (key == self._editingParameter) return;
			
			// Global keys will update the associated global property, rather than the data attribute
			if (key in self._globalParameters) {
				//self.controller.globalParameter(key, {didUpdateToValue: value});
				self._globalParameters[key] = value;
				//self.controller.setProperty(key, value);
				return;
			}
			
			// Otherwise publish the update to the data property
			var updatedParameters = BMKeysForValue(key, {inObject: self._parameterMap});
			
			updatedParameters.forEach(function (parameter) {
				// If the updated parameter was the entire row, it needs to be handled separately
				if (parameter == '@row') {
					// Ignore setting the row to undefined
					let row = value && value.rows && value.rows[0];
					if (!row) return;

					// Update each parameter from the mashup row into the parameters map
					for (const key in row) {
						self._parameters[key] = row[key];
					}
					return;
				}
				// Use the typecast value rather than the raw value
				self._parameters[parameter] = mashup.rootWidget.getProperty(key);
			});
			
			// Dispatch a property update to the Thingworx runtime
			self.controller.setProperty('Data', self.controller.getProperty('Data'));
			
		};
		
		// Set up the parameter values
		if (self._parameters) self._setParametersInternal();
		if (self._globalParameters) self._setGlobalParametersInternal();
		self._setEditingParameterInternal();
		self._setSelectedParameterInternal();
		
		// Fire the MashupLoaded event to signal that loading is complete
        mashup.fireMashupLoadedEvent();

		if (performsMashupTransition && mashupRootView) {
			// Layout the mashup contents prior to rendering
			if (this.attributes) {
				(this.layoutQueue as any)._views.delete(this);
				this.layoutSubviews();
			}

			this._awaitsMashupUpdate = YES;
			
			mashupRootView.allSubviews.forEach(subview => {
				// For each subview, try to find a matching subview from the previous mashup instance with the same displayName
				let debuggingName = subview.debuggingName;

				this._previousMashupInstance!._BMView!.allSubviews.forEach(previousSubview => {
					// When one is found, set the new subview's frame relative to the root view to the previous subview's frame
					if (previousSubview.debuggingName == debuggingName) {
						subview.frameRelativeToRootView = previousSubview.frameRelativeToRootView;
					}
				});
			});
		}
		
		// Let the delegate know that the mashup was rendered if needed				
		if (mashup.BMCellDelegate && mashup.BMCellDelegate.collectionViewDidRenderCell) {
			mashup.BMCellDelegate.collectionViewDidRenderCellForIndexPath(this.collectionView, this);
		}
        
        // Restore the previous mashup ID and object
        TW.Runtime.HtmlIdOfCurrentlyLoadedMashup = currentHTMLID;
		TW.Runtime.Workspace.Mashups.Current = currentMashup;
		
		// If there was a previous mashup that should be destroyed, run an animation and then destroy it
		if (this._previousMashupInstance) {
			let previousMashupInstance = this._previousMashupInstance;
			$.Velocity.animate(this._previousMashupInstance.rootWidget.boundingBox[0], {opacity: 0}, {duration: 500, easing: 'easeInOutQuad'});
			$.Velocity.animate(containerNode, {opacity: 1}, {duration: 500, easing: 'easeInOutQuad', complete: () => {
				this._previousMashupInstance = undefined;
				previousMashupInstance.destroyMashup();
				if (previousMashupInstance._BMView) {
					previousMashupInstance._BMView.release();
				}
			}});
		}
	}

	// @override - BMCollectionViewCell
	prepareForAnimatedUpdate() {
		if (this._awaitsMashupUpdate) {
			this.needsLayout = YES;
			this._awaitsMashupUpdate = NO;
		}
	}

	frameForDescendant(descendant: BMView): BMRect {
		// If the frame is requested during an animated mashup change and this view is a descendant of the old mashup, assign it, if possible,
		// the frame of the matching new view
		if (this._previousMashupInstance && this._previousMashupInstance._BMView) {
			if (this._mashupInstance && this._mashupInstance._BMView) {
				if (BMAnimationContextGetCurrent()) {
					//Try to find a matching subview from the new mashup instance with the same displayName
					let debuggingName = descendant.debuggingName;

					if (descendant.isDescendantOfView(this._previousMashupInstance._BMView)) for (let newSubview of this._mashupInstance._BMView.allSubviews) {
						// When one is found, set the new subview's frame relative to the root view to the previous subview's frame
						if (newSubview.debuggingName == debuggingName) {
							let offset = BMPointMake();
							let localFrame = descendant.frame;
							let offsetFrame = descendant.frameRelativeToRootView;
							offset.x = offsetFrame.origin.x - localFrame.origin.x;
							offset.y = offsetFrame.origin.y - localFrame.origin.y;

							let frame = newSubview.frameRelativeToRootView.copy();
							frame.origin.x -= offset.x;
							frame.origin.y -= offset.y;
							return frame;
						}
					}
				}
			}
		}
		return super.frameForDescendant(descendant);
	}
	
	/**
	 * Highly experimental fast widget append method. This will skip creating the bounding boxes and outer containers and simply 
	 * create and insert the renderHTML result directly into the page.
	 * When this method is invoked, it will have the widget element as its context.
	 * Note that unlike the regular widget appendTo prototype method, this will invoke all widget methods without catching errors.
	 * Additionally, this method does not handle page mashup containers, dashboards and Internet Explorer specific fixes.
	 * @param container <$>			The jQuery container in which the widget should be added.
	 * @param mashup <TWMashup>		The mashup to which this widget belongs.
	 */
	_fastWidgetAppend(this: TWRuntimeWidgetPrivate, container: $, mashup: BMCollectionViewMashup) {
		var widget = this;
		
		// Create a unique ID for this widget and assign it to the jqElementId property
		var ID = TW.Runtime.Workspace.Mashups.Current.rootName + "_" + this.properties.Id;
		this.jqElementId = ID;
		
		// Get the property attributes
		var runtimeProperties = this.runtimeProperties();
		this.propertyAttributes = runtimeProperties.propertyAttributes || {};
		
		// Data loading and error are never supported by this method
		runtimeProperties.needsDataLoadingAndError = NO;
		runtimeProperties.needsError = NO;
		this.properties.ShowDataLoading = NO;
		
		// Set up the mashup reference
		this.mashup = TW.Runtime.Workspace.Mashups.Current;
		this.idOfThisMashup = TW.Runtime.HtmlIdOfCurrentlyLoadedMashup;
		this.idOfThisElement = this.properties.Id;
		
		// TODO inspect what this does
		for (var name in this.propertyAttributes) {
			var attributes = this.propertyAttributes[name];
			if (attributes.localizedString) {
				if (this.properties[name]) {
				    TW.log.error('Runtime Widget is using localizedString for a property already defined in ide.js, widget:"' + ID + '", property:"' + name + '"');
				}
				else {
				    this.properties[name] = TW.Runtime.convertLocalizableString('[[' + attributes.localizedString + ']]');
				}
			}
		}

		// Add mashup styles for mashup widgets
		if (this.properties.Type === 'mashup' || this.properties.Type === 'targetmashup' || 
			this.properties.Type === 'thingtemplatemashup' || this.properties.Type === 'thingshapemashup' ) {
			container.prepend('<div class="mashup-styles"></div>');
		}
		
		// Find out if this is a responsive widget
		var isResponsive = (this.properties.ResponsiveLayout || this.properties.Type === 'container');
		
		// The layout CSS is generated based on whether this widget is responsive or not
		var layoutCSS;
		if (isResponsive) {
			// Responsive widgets fill their container from the top-left corner
			layoutCSS = {
				width: '100%',
				height: '100%',
				position: 'absolute',
				left: '0px',
				top: '0px'	
			};
		}
		else {
			// Non-responsive widgets have variable sizes and positions
			layoutCSS = {
				width: this.properties.Width + 'px',
				height: this.properties.Height + 'px',
				position: 'absolute',
				left: this.properties.Left + 'px',
				top: this.properties.Top + 'px'	
			};
		}
		
		// NOTE: Labels are not supported by this method.
		
		// Obtain the HTML representation of this widget
		var widgetElement = $(this.renderHtml());
		
		// Set up the ID and layout of the element
		widgetElement.attr('id', ID);
		// Some widgets use the jQuery method closest() to find their bounding box instead of the platform standard boundingBox property.
		// As fastWidgetAppend does not create bounding boxes, this will cause those widget to obtain bounding boxes belonging to other widgets.
		// To counter this, the widget element will get the widget-bounding-box class in addition to the widget-content class.
		widgetElement.addClass('widget-bounding-box');
		widgetElement.css(layoutCSS);
		
		// The bounding box and jQuery element are identical for this method
		// NOTE: this may cause certain widgets to behave in an unexpected manner.
		this.jqElement = widgetElement;
		this.boundingBox = widgetElement;
		
		// Add the widget element to the container
		container.append(widgetElement);
		
		// Mashup containers and page mashup containers need an additional containerInfo object
		if (runtimeProperties.isMashupContainer || runtimeProperties.isPageMashupContainers) {
			this.containerInfo = {thisPropertyId: ID};
		}
		
		// Add data structures to the jQuery element
		widgetElement.data('widget', this);
		widgetElement.data('properties', this.properties);
		
		// Invoke afterRender
		if (this.afterRender) {
			// All responsive widgets should have their sizing properties initialized before invoking afterRender
			if (this.properties.ResponsiveLayout || this.properties.supportsAutoResize) {
				this.properties.Width = widgetElement.outerWidth();
				this.properties.Height = widgetElement.outerHeight();
			}
			
			this.afterRender();
		}
		
		// NOTE: this method does not support older versions of internet explorer
		
		// Add the styles to the mashup if supported
		if (this.renderStyles) {
			this.mashup.addStyles(this.renderStyles());
		}
		
		// Append the contained widgets
		var widgets = this.getWidgets();
		var widgetCount = widgets.length;
		
		// Containers with declarative spots for sub-widgets need to have their widgets added to specific containers whenever possible
		if (runtimeProperties.isContainerWithDeclarativeSpotsForSubWidgets) {
			for (var i = 0; i < widgetCount; i++) {
				// Find the container in which this widget should go
				var widgetContainer = widgetElement.find('[sub-widget-container-id="' + this.properties.Id + '"][sub-widget="' + (i + 1) + '"]');
	            if (widgetContainer.length > 0) {
		            // If it was found, add it to that container
		            if (runtimeProperties._BMSupportsFastWidgetAppend) {
						widgets[i].appendTo(widgetContainer, mashup, YES);
					}
					else {
						BMCollectionViewMashupCell.prototype._fastWidgetAppend.call(widgets[i], widgetContainer, mashup);
					}
	            } 
	            else {
		            // If it wasn't found, just add it to the widget directly
		            if (runtimeProperties._BMSupportsFastWidgetAppend) {
						widgets[i].appendTo(widgetElement, mashup, YES);
					}
					else {
						BMCollectionViewMashupCell.prototype._fastWidgetAppend.call(widgets[i], widgetElement, mashup);
					}
	            }
			}
		}
		else {
			for (var i = 0; i < widgetCount; i++) {
				// Sub widgets are also rendered using fastWidgetAppend instead of the platform standard appendTo,
				// unless they support their own optimized appendTo method, in which case that is used
				if (runtimeProperties._BMSupportsFastWidgetAppend) {
					widgets[i].appendTo(widgetElement, mashup, YES);
				}
				else {
					BMCollectionViewMashupCell.prototype._fastWidgetAppend.call(widgets[i], widgetElement, mashup);
				}
			}
		}
		
		// Set up the z-index
		// To keep things consistent with the rest of the platform, 1500 is added to all non-mashup z-indexes, with a maximum value of 6500
		if (this.properties['Z-index']) {
			if (this.properties.Id === 'mashup-root') {
				widgetElement.css('z-index', this.properties['Z-index']);
			}
			else {
				widgetElement.css('z-index', Math.min(this.properties['Z-index'] + 1500, 6500));
			}
		}
		
		// If the widget has a border, it needs its box-sizing set to border-box so it doesn't overflow its bounds
		if (runtimeProperties.borderWidth) {
			widgetElement.css('box-sizing', 'border-box');
		}
		
		// Invoke afterWidgetsRendered if available
		if (this.afterWidgetsRendered) {
			this.afterWidgetsRendered();
		}
		
		// Hide widgets that are not visible
		if (!this.properties.Visible) {
			widgetElement.hide();
		}
		
		// NOTE: dashboards are not supported
		// NOTE: page mashup containers are not supported
		
		// Check to see if this widget supports selection updates
		if (this.handleSelectionUpdate) {
			this.lastSelectionUpdateCount = 0;
			
			// Find and enumerate this widget's bindings, looking for 'All Data' bindings.
			var bindings = this.mashup.findDataBindingsByTargetAreaAndId('UI', this.properties.Id);
			var widget = this;
			$.each(bindings, function (index, binding) {
				var isBoundToSelectedRows = TW.Runtime.isBindingBoundToSelectedRows(this);
				
				if (!isBoundToSelectedRows && this.PropertyMaps[0].TargetPropertyBaseType === 'INFOTABLE') {
					// If this binding is an 'All Data' infotable binding, register this widget as an observer for selected rows
					widget.mashup.dataMgr.addSelectedRowsForWidgetHandleSelectionUpdateSubscription(binding, function (sourceId, selectedRows, selectedRowIndices) {
						// Only notify if the selection update comes from a different widget
						if (sourceId !== widget.jqElementId) {
							widget.handleSelectionUpdate!(binding.PropertyMaps[0].TargetProperty, selectedRows, selectedRowIndices);
						}
					} as any);
				}
			});
		}
	}
	//#endregion

}

// Export mashup cell as a global property to allow non-webpack scripts to extend it
declare global {
	interface Window {
		BMCollectionViewMashupCell: typeof BMCollectionViewMashupCell;
	}
}

(window as any).BMCollectionViewMashupCell = BMCollectionViewMashupCell;

// #endregion

// #region Widget

/**
 * The collection view widget 
 */
@TWNamedRuntimeWidget("BMCollectionView")
export class BMCollectionViewWidget extends TWRuntimeWidget
implements BMCollectionViewDelegate, BMCollectionViewDataSet, BMCollectionViewDelegateTableLayout, BMCollectionViewDelegateFlowLayout, BMCollectionViewDelegateMasonryLayout {


    // #region Properties
    
	collectionView!: BMManagedCollectionView;

	subviewMap: Dictionary<BMView> = {};

    /**
     * The CoreUI view managing this widget.
     */
    protected _coreUIView!: BMManagedCollectionView;
    get coreUIView(): BMManagedCollectionView {
        if (!this._coreUIView) {
			var useCustomScrollbar: boolean | undefined;
		
			if (this.getProperty('UseCustomScrollerOnWindowsDesktops')) {
				useCustomScrollbar = !navigator.platform.match(/(Mac|iPhone|iPod|iPad|Windows Phone|Android)/i) || (window.navigator as any).standalone;
			}
			if (this.getProperty('AlwaysUseCustomScrollerOniOS')) {
				useCustomScrollbar = useCustomScrollbar! || navigator.platform.match(/(iPhone|iPod|iPad)/i) || (window.navigator as any).standalone;
			}
			
			// Custom scrollbars are required for the masonry layout
			var layout = this.getProperty('Layout');
			if (layout === 'masonry') {
				useCustomScrollbar = YES;
			}
			if (layout.indexOf('calendar') == 0) {
				useCustomScrollbar = YES;
			}
			
			// Custom scrollbars are required when pinning headers or footers to the content edge
			if (this.getProperty('TableLayoutPinsHeadersToContentEdge') || this.getProperty('TableLayoutPinsFootersToContentEdge') || this.getProperty('TileLayoutPinsFootersToContentEdge') ||
				this.getProperty('FlowLayoutPinsHeadersToContentEdge') || this.getProperty('FlowLayoutPinsFootersToContentEdge') || this.getProperty('TileLayoutPinsFootersToContentEdge')) {
				useCustomScrollbar = YES;
			}
	
			// Custom scrollbars are also required when using ScrollbarStyle
			if (this.getProperty('ScrollbarStyle')) {
				useCustomScrollbar = YES;
			}

			let view = (<any>BMCollectionView).collectionViewForNode((this.jqElement ? this.jqElement[0] : document.createElement('div')), {customScroll: useCustomScrollbar});
			view.node.classList.add('widget-content');
			view.node.classList.add('widget-bounding-box');
            view.debuggingName = this.getProperty('DisplayName');
            this._coreUIView = view;
        }
        return this._coreUIView;
    };
	
	/**
	 * The raw infotable data set.
	 */
	data: any[] = [];
	
	/**
	 * When using the SortField or Filter properties, this variable will hold a reference to the original unmodified data.
	 */
	originalData?: any[];
	
	/**
	 * Temporary storage variables holding references to the old and new data sets during an
	 * animated data update.
	 */
    oldData?: any[];
	
	/**
	 * Temporary storage variables holding references to the old and new data sets during an
	 * animated data update.
	 */
    newData?: any[];
	
	/**
	 * The infotable field that uniquely identifies an object.
	 */
	UIDField!: string;
	
	/**
	 * The infotable field that uniquely identifies an object's section.
	 */
	sectionField?: string;
	
	/**
	 * The infotable field by which section contents are sorted.
	 */
	sortField?: string;
	
	/**
	 * Whether the sort should be ascending or descending.
	 */
	sortAscending: boolean = false;
	
	/**
	 * The predicate used to filter the data set.
	 */
	filter: any; // <BMPredicate>
	
	/**
	 * The name of the mashup to use for cells.
	 */
	cellMashupName?: string;

	/**
	 * The name of the infotable field that contains the mashup name.
	 */
	cellMashupNameField?: string;

	/**
	 * The infotable field that contains the cell width.
	 */
	cellWidthField?: string;

	/**
	 * The infotable field that contains the cell height.
	 */
	cellHeightField?: string;
	
	/**
	 * The mapping between infotable fields and mashup parameters.
	 */
	cellMashupPropertyBinding!: Dictionary<string>;
	
	/**
	 * The mashup parameter that represents the selected state of its associated data object.
	 */
	cellMashupSelectedField?: string;
	
	/**
	 * The name of the mashup to use for headers.
	 */
	headerMashupName?: string;
	
	/**
	 * The mashup property that will receive the section identifier.
	 */
	headerMashupSectionProperty?: string;
	
	/**
	 * The name of the mashup to use for footers.
	 */
	footerMashupName?: string; // <String>
	
	/**
	 * The mashup property that will receive the section identifier.
	 */
	footerMashupSectionProperty?: string;
	
	/**
	 * The array of sections.
	 */
	sections?: any[];
	
	/**
	 * The name of the mashup displayed when the data set is empty.
	 */
	emptyMashupName?: string;
	
	/**
	 * Controls whether cells can be selected and whether more than one cell can be selected at a time.
	 */
	canSelectCells: boolean = YES;
	canSelectMultipleCells: boolean = YES;

	/**
	 * Controls the behavior of multiple selection.
	 */
	multipleSelectionType: any = BMCollectionViewCellMultipleSelectionType.Disabled;

	/**
	 * Set to YES if the multiple selection type is set to Ctrl+Click and ctrl or cmd are pressed.
	 */
	isCtrlPressed: boolean = NO;

	/**
	 * Set to YES while selection mode is enabled.
	 * When selection mode is enabled, canSelectCells is ignored and selection will always work.
	 */
	isSelectionModeEnabled: boolean = NO;

	/**
	 * Set to YES if long click should select cells.
	 * Long click selects cells if the long click is bound to BeginSelectionMode.
	 */
	longClickSelectsCell: boolean = NO;
	
	/**
	 * Controls whether the collection view auto-scrolls to the first selected cell when the selection changes.
	 */
	scrollsToSelectedCell: boolean = NO;
	
	/**
	 * Controls whether the collection view auto-selectes the first index path when new data arrives and there is no selected cell.
	 */
	autoSelectsFirstCell: boolean = NO;

	/**
	 * Set to YES if the cells in this collection view respond to right clicks.
	 */
	canRightClick: boolean = NO;
	
	
	// ******************************************** STYLE PROPERTIES ********************************************
	
	/**
	 * The style to use forselected cells.
	 */
	cellStyleSelected: any; // <TWStyleDefinition>
	
	/**
	 * The opacity of the selected background color.
	 */
	cellStyleSelectedAlpha?: number; // <Number>
	
	/**
	 * The color of the selected cells, without the alpha component.
	 */
	cellStyleSelectedColorComponents?: [number, number, number];
	
	
	/**
	 * The color of the selected cells.
	 */
	cellStyleSelectedColor?: BMColor;
	
	/**
	 * The cell background style.
	 */
	cellStyle: any; // <TWStyleDefinition, nullable>

	/**
	 * The cell background style color.
	 */
	cellStyleColor?: BMColor;
	
	/**
	 * The mashup to use for selected cells.
	 */
	cellMashupNameSelected?: string;
	
    oldSections?: any[]; 
    newSections?: any[];
	
	/**
	 * When CellStyleHover is defined, this represents the CSS rule added to the document
	 * that changes the cell's hover style.
	 */
	hoverStyleBlock?: $;
	
	/**
	 * Whether or not ripples are enabled.
	 */
	usesRipple!: boolean;
	
	/**
	 * The ripple color style.
	 */
	rippleStyle?: any;
	
	/**
	 * The border radius to apply to the cells.
	 */
	cellBorderRadius?: string;
	
	/**
	 * The box shadow to apply to the cells.
	 */
	cellBoxShadow?: string;
	
	
	// ******************************************** MENU PROPERTIES ********************************************
	/**
	 * The array of menu entries.
	 */
	menuDefinition?: string[];
	
	/**
	 * The array of state definitions for the menu.
	 */
	menuStateDefinition: any; // <[TWStateDefinition]>
	
	/**
	 * Should be set to YES to use the default gestures to invoke the slide menu.
	 * If set to NO, the menu controller must be used to control the slide menu.
	 */
	menuUseBuiltin: boolean = YES;
	
	/**
	 * Controls how menu entries are laid out.
	 */
	menuOrientation?: string;
	
	/**
	 * Controls the size of the menu icons.
	 */
	menuIconSize?: number;
	
	/**
	 * Controls the placement of the menu icons.
	 */
	menuIconGravity?: string;

	/**
	 * The type of slide menu to use.
	 */
	private menuKind: BMCollectionViewWidgetSlideMenuType = BMCollectionViewWidgetSlideMenuType.Auto;
	
	runtimeProperties() {
		return {
			needsDataLoadingAndError: NO,
			// When this property is set to YES for any widget, fastWidgetAppend will invoke that widget's own appendTo() method
			// instead of the generic fastWidgetAppend() method.
			_BMSupportsFastWidgetAppend: YES
		};
	}
	
	
	// ******************************************** GLOBAL PROPERTIES ********************************************
	/**
	 * The map of global properties with their data types.
	 */
    globalDataShape!: Dictionary<TWBaseType>;
    
    /**
     * An object containing the current values of all the global parameters.
     */
    globalParameters!: Dictionary<any>;
	
	
	// ******************************************** DATA MANIPULATION PROPERTIES ********************************************
	
	/**
	 * The data shape to use when manipulating data.
	 */
	dataShape!: TWDataShape;
	
	/**
	 * The mashup to use for editing cells.
	 */
	cellMashupNameEditing?: string;
	
	/**
	 * The mashup to use for editing cells.
	 */
	cellMashupEditingParameter?: string;

	/**
	 * The collection view whose scroll position will be linked to this one's.
	 */
	linkedCollectionViews!: BMCollectionViewWidget[];
	
	
	// ******************************************** DELEGATE PROPERTIES ********************************************
	/**
	 * A scriptable function allowing variable mashup contents depending on the target objects.
	 */
	reuseIdentifierForCellAtIndexPath?: ((BMIndexPath) => string) = undefined; // <String ^ (BMIndexPath), nullable>
	
	/**
	 * A scriptable function allowing variable mashup contents depending on the target objects.
	 */
    mashupNameForCellAtIndexPath?: ((BMIndexPath) => string) = undefined; // <String ^ (BMIndexPath), nullable>
    
    // #endregion


	// #region Layout Methods
	// ******************************************** LAYOUT METHODS ********************************************
	
	// @override - BMCollectionViewFlowLayoutDelegate
	collectionViewSizeForCellAtIndexPath(collectionView: BMCollectionView, indexPath: BMIndexPath): BMSize {
		return BMSizeMake(this.getProperty('CellWidth'), this.getProperty('CellHeight'));
	};
	
	// @override - BMCollectionViewMasonryLayoutDelegate
	collectionViewHeightForCellAtIndexPath(collectionView: BMCollectionView, indexPath: BMIndexPath, options: {forColumnWidth: number}): number {
		return this.getProperty('CellHeight');
	};
	
	// @override - BMCollectionViewMasonryLayoutDelegate
	collectionViewRowHeightForCellAtIndexPath(collectionView: BMCollectionView, indexPath: BMIndexPath): number {
		return this.getProperty('CellHeight');
	};
	
	/**
	 * Constructs and configures a flow layout based on this widget's property vlaues.
	 * @return <BMCollectionViewFlowLayout>		A flow layout.
	 */
	createFlowLayout(): BMCollectionViewFlowLayout {
		var layout = new BMCollectionViewFlowLayout();
		layout.orientation = BMCollectionViewFlowLayoutOrientation[this.getProperty('FlowLayoutOrientation', 'Vertical')];
		layout.rowSpacing = this.getProperty('FlowLayoutRowSpacing');
		layout.minimumSpacing = this.getProperty('FlowLayoutMinimumSpacing');
		layout.gravity = BMCollectionViewFlowLayoutGravity[this.getProperty('FlowLayoutGravity')];
		layout.alignment = BMCollectionViewFlowLayoutAlignment[this.getProperty('FlowLayoutAlignment') || 'Center'];
		layout.leftAlignFinalRow = this.getProperty('FlowLayoutLeftAlignFinalRow');

		
		if (this.getProperty('CellMashupHasIntrinsicSize') || this.cellWidthField || this.cellHeightField) {
			layout.cellSize = undefined;
		}
		else {
			layout.cellSize = BMSizeMake(this.getProperty('CellWidth'), this.getProperty('CellHeight'));
		}

		if (this.getProperty('AutomaticCellSize')) {
			(layout as any).expectedCellSize = BMSizeMake(this.getProperty('CellWidth'), this.getProperty('CellHeight'));
		}

		(layout as any).maximumCellsPerRow = this.getProperty('FlowLayoutMaximumCellsPerRow');
		
		layout.topPadding = this.getProperty('FlowLayoutTopPadding');
		layout.bottomPadding = this.getProperty('FlowLayoutBottomPadding');

		layout.contentGravity = BMCollectionViewFlowLayoutAlignment[this.getProperty('FlowLayoutContentGravity')];
		
		if (this.sectionField) {
		
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
		if ((this.getProperty('CellMashupHasIntrinsicSize') && this.cellMashupNameField) || this.cellHeightField) {
			layout.rowHeight = BMCollectionViewTableLayoutRowHeightVariable;
		}
		else {
			layout.rowHeight = this.getProperty('CellHeight');
		}
		
		if (this.sectionField) {
		
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

	//#endregion


    // #region Widget Lifecycle

    renderHtml(): string {

		var html = '<div class="widget-content BMCollectionViewWidget' + (BMIsTouchDevice ? '' : ' BMCollectionViewDesktop') + '" style="overflow: auto; -webkit-overflow-scrolling: touch;"></div>';
		return html;
    };

    /**
     * A promise that resolves when `afterRender` finishes executing.
     */
    afterRendered?: Promise<void>;

    async afterRender(): Promise<void> {
        require('./styles/runtime.css');
		this.UIDField = this.getProperty("UIDField");

		this.linkedCollectionViews = [];

		// This promise is used to asynchronously preload the mashups for CellMashupName, CellMashupNameSelected and CellMashupNameEditing if they are set
		// to avoid blocking user interaction of atomic requests if they are needed when rendering cells
		var afterRenderedResolve;
		this.afterRendered = new Promise(function (resolve, reject) {
			afterRenderedResolve = resolve;
		});
		let afterRendered = this.afterRendered;

		let backgroundStyle = TW.getStyleFromStyleDefinition(this.getProperty('BackgroundStyle'));

		if (backgroundStyle && backgroundStyle.backgroundColor) {
			this.jqElement.css({backgroundColor: backgroundStyle.backgroundColor});
		}

		var useCustomScrollbar: boolean | undefined;
		
		// Load the menu properties
		try {
			this.menuDefinition = JSON.parse(this.getProperty('_MenuDefinition'));
		}
		catch (err) {
			this.menuDefinition = [];
		}
		this.menuStateDefinition = TW.getStateDefinition(this.getProperty('CellSlideMenu'));
		this.menuStateDefinition = this.menuStateDefinition && this.menuStateDefinition.content && this.menuStateDefinition.content.stateDefinitions;
		this.menuOrientation = this.getProperty('CellSlideMenuOrientation');
		this.menuIconSize = this.getProperty('CellSlideMenuIconSize');
		this.menuIconGravity = this.getProperty('CellSlideMenuIconGravity');
		this.menuUseBuiltin = this.getProperty('CellSlideMenuUseBuiltin');
		this.menuKind = this.getProperty('CellSlideMenuType') || BMCollectionViewWidgetSlideMenuType.Auto;
		
		// Load the global data shape
		try {
			this.globalDataShape = JSON.parse(this.getProperty('_GlobalDataShape'));
		}
		catch (e) {
			this.globalDataShape = {};
		}
		this.globalDataShape = this.globalDataShape;

		// Set up the global parameter proxy object that duplicates its state to all bound mashups
		this.globalParameters = {};
		for (var key in this.globalDataShape) {
            let self = this;
			(function (key) {
				var storage = self.getProperty(key);
				Object.defineProperty(self.globalParameters, key, {
					get() {
						return storage;
					},
					set(value) {
						storage = value;
						self.setProperty(key, value);

						self.collectionView.enumerateAllCellsWithBlock(((cell, type) => {
							if (type == BMCollectionViewLayoutAttributesType.Cell) {
								cell._mashupInstance && cell._mashupInstance.BM_setParameterInternal(key, value);
							}
						}) as any);
					}
				});
			})(key);
		}
		
		var canDoubleClick = NO;
		// To figure out if this widget supports double clicking or right clicking, it is required to check the event bindings to find out if the 'CellWasDoubleClicked' event
		// has any targets
		var eventBindings = this.mashup.Events;
		var eventBindingsCount = eventBindings.length;
		var collectionViewWidgetId = this.idOfThisElement;
		for (var i = 0; i < eventBindingsCount; i++) {
			var binding = eventBindings[i];

			if (binding.EventTriggerId === collectionViewWidgetId && binding.EventTriggerEvent === 'CellWasLongClicked' &&
				binding.EventHandlerId === collectionViewWidgetId && binding.EventHandlerService === 'BeginSelectionMode') {
				this.longClickSelectsCell = YES;
				if (this.canRightClick && canDoubleClick) break;
			}
			
			if (binding.EventTriggerId === collectionViewWidgetId && binding.EventTriggerEvent === 'CellWasDoubleClicked') {
				// It is sufficient to find a single binding for this event to enable double clicking
				canDoubleClick = YES;
				if (this.canRightClick && this.longClickSelectsCell) break;
			}
			
			if (binding.EventTriggerId === collectionViewWidgetId && binding.EventTriggerEvent === 'CellWasRightClicked') {
				// It is sufficient to find a single binding for this event to enable rick clicking
				this.canRightClick = YES;
				if (canDoubleClick && this.longClickSelectsCell) break;
			}
		}
		this.setProperty('_CanDoubleClick', canDoubleClick);

		// NOTE: longClickSelectsCell is disabled if menu type is set to popup and the menu is enabled
		if (this.menuStateDefinition && this.menuStateDefinition.length && this.menuKind === BMCollectionViewWidgetSlideMenuType.Popup) {
			this.longClickSelectsCell = NO;
		}
		
		// Set the HasSelectedCells property to NO by default, until data arrives and can be selected
		this.setProperty('HasSelectedCells', NO);
		
		if (this.getProperty('UseCustomScrollerOnWindowsDesktops')) {
			useCustomScrollbar = !navigator.platform.match(/(Mac|iPhone|iPod|iPad|Windows Phone|Android)/i) || (window.navigator as any).standalone;
		}
		if (this.getProperty('AlwaysUseCustomScrollerOniOS')) {
			useCustomScrollbar = useCustomScrollbar! || navigator.platform.match(/(iPhone|iPod|iPad)/i) || (window.navigator as any).standalone;
		}
		
		// Custom scrollbars are required for the masonry layout
		var layout = this.getProperty('Layout');
		if (layout === 'masonry') {
			useCustomScrollbar = YES;
		}
		if (layout.indexOf('calendar') == 0) {
			useCustomScrollbar = YES;
		}
		
		// Custom scrollbars are required when pinning headers or footers to the content edge
		if (this.getProperty('TableLayoutPinsHeadersToContentEdge') || this.getProperty('TableLayoutPinsFootersToContentEdge') || this.getProperty('TileLayoutPinsFootersToContentEdge') ||
			this.getProperty('FlowLayoutPinsHeadersToContentEdge') || this.getProperty('FlowLayoutPinsFootersToContentEdge') || this.getProperty('TileLayoutPinsFootersToContentEdge')) {
			useCustomScrollbar = YES;
		}

		// Custom scrollbars are also required when using ScrollbarStyle
		let scrollbarCSS;
		if (this.getProperty('ScrollbarStyle')) {
			useCustomScrollbar = YES;
			let scrollbarStyle = TW.getStyleFromStyleDefinition(this.getProperty('ScrollbarStyle'));
			let scrollbarTrackStyle = TW.getStyleFromStyleDefinition(this.getProperty('ScrollbarTrackStyle'));

			let indicatorCSSRule = {
				'box-sizing': 'border-box',
				'background-color': scrollbarStyle.backgroundColor,
				'border-radius': this.getProperty('ScrollbarBorderRadius') + 'px'
			};

			if (scrollbarStyle.lineColor) {
				BMCopyProperties(indicatorCSSRule, {
					'border-width': scrollbarStyle.lineThickness + 'px',
					'border-style': scrollbarStyle.lineStyle,
					'border-color': scrollbarStyle.lineColor
				});
			}
			else {
				BMCopyProperties(indicatorCSSRule, {
					'border-width': '0px',
					'border-style': 'none',
					'border-color': 'transparent'
				});
			}

			let indicatorCSS = BMCSSRuleWithSelector('#' + this.jqElementId + ' .iScrollIndicator', {important: YES, properties: indicatorCSSRule});
			let indicatorWidthCSS = '#' + this.jqElementId + ' .iScrollVerticalScrollbar { width: ' + this.getProperty('ScrollbarWidth') + 'px !important; }\n';
			let indicatorHeightCSS = '#' + this.jqElementId + ' .iScrollHorizontalScrollbar { height: ' + this.getProperty('ScrollbarWidth') + 'px !important; }\n';

			// This additional style is required to fix the R&D defaults
			let indicatorInnerWidthCSS = '#' + this.jqElementId + ' .iScrollVerticalScrollbar > .iScrollIndicator { width: ' + this.getProperty('ScrollbarWidth') + 'px !important; right: 0px !important; }\n';
			let indicatorInnerHeightCSS = '#' + this.jqElementId + ' .iScrollHorizontalScrollbar > .iScrollIndicator { height: ' + this.getProperty('ScrollbarWidth') + 'px !important; bottom: 0px !important; }\n';

			scrollbarCSS = indicatorCSS + indicatorWidthCSS + indicatorHeightCSS + indicatorInnerWidthCSS + indicatorInnerHeightCSS;

			if (scrollbarTrackStyle) {
				let trackCSSRule = {
					'box-sizing': 'content-box',
					'background-color': scrollbarTrackStyle.backgroundColor,
					'border-radius': this.getProperty('ScrollbarBorderRadius') + 'px'
				};
	
				if (scrollbarTrackStyle.lineColor) {
					BMCopyProperties(trackCSSRule, {
						'border-width': scrollbarTrackStyle.lineThickness + 'px',
						'border-style': scrollbarTrackStyle.lineStyle,
						'border-color': scrollbarTrackStyle.lineColor
					});
				}
				else {
					BMCopyProperties(trackCSSRule, {
						'border-width': '0px',
						'border-style': 'none',
						'border-color': 'transparent'
					});
				}

				scrollbarCSS += BMCSSRuleWithSelector('#' + this.jqElementId + ' .iScrollVerticalScrollbar, #' + this.jqElementId + ' .iScrollVerticalScrollbar', {important: YES, properties: trackCSSRule});
			}
		}
		
		if (!this._coreUIView) {
			this.collectionView = BMCollectionView.collectionViewForNode(this.jqElement[0], {customScroll: useCustomScrollbar}) as BMManagedCollectionView;
		}
		else {
			this.collectionView = this.coreUIView;
		}

		(<any>this.collectionView.offscreenBufferFactor) = this.getProperty('OffScreenBufferFactor');
		this.collectionView.controller = this;

		this.collectionView.cellClass = BMCollectionViewMashupCell;
		
		if (this.sectionField = this.getProperty('SectionField')) {

			this.headerMashupName = this.getProperty('HeaderMashupName');
			this.footerMashupName = this.getProperty('FooterMashupName');

			if (this.headerMashupName) await BMCollectionViewDefinitionForMashupNamed(this.headerMashupName, {atomic: NO});
			if (this.footerMashupName) await BMCollectionViewDefinitionForMashupNamed(this.footerMashupName, {atomic: NO});
		
			this.headerMashupSectionProperty = this.getProperty('HeaderMashupSectionProperty');
			this.footerMashupSectionProperty = this.getProperty('FooterMashupSectionProperty');
		
		}
		
		// Create the handlers for the mashup name field
		this.cellMashupNameField = this.getProperty('CellMashupNameField');
		if (this.cellMashupNameField) {
			this.reuseIdentifierForCellAtIndexPath = (indexPath) => {
				return indexPath.object[this.cellMashupNameField!];
			};

			this.mashupNameForCellAtIndexPath = (indexPath) => {
				return indexPath.object[this.cellMashupNameField!];
			};
		}

		// Get the dynamic size properties
		this.cellWidthField = this.getProperty('CellWidthField');
		this.cellHeightField = this.getProperty('CellHeightField');

		var cellWidth = this.getProperty('CellWidth');
		var cellHeight = this.getProperty('CellHeight');

		// Create the handlers for intrinsic sizes
		if (this.getProperty('CellMashupHasIntrinsicSize') && this.cellMashupNameField) {
			// Used by Flow layout
			this.collectionViewSizeForCellAtIndexPath = (collectionView, indexPath) => {
                // In the new framework, by this point mashups are always cached
				var mashupDefinition = BMCollectionViewMashupDefinitionCache[indexPath.object[this.cellMashupNameField!]] || this.definitionForMashupNamed(indexPath.object[this.cellMashupNameField!], {atomic: YES}) as BMCollectionViewDeserializedMashupEntityDefinition;

				var content = mashupDefinition._BMDeserializedContent || (mashupDefinition._BMDeserializedContent = JSON.parse(mashupDefinition.mashupContent) as TWMashupDefinition);

				return BMSizeMake(content.UI.Properties.Width, content.UI.Properties.Height);
			}

			// Used by Table layout
			this.collectionViewRowHeightForCellAtIndexPath = (collectionView, indexPath) => {
				var mashupDefinition = BMCollectionViewMashupDefinitionCache[indexPath.object[this.cellMashupNameField!]] || this.definitionForMashupNamed(indexPath.object[this.cellMashupNameField!], {atomic: YES}) as BMCollectionViewDeserializedMashupEntityDefinition;

				var content = mashupDefinition._BMDeserializedContent || (mashupDefinition._BMDeserializedContent = JSON.parse(mashupDefinition.mashupContent) as TWMashupDefinition);

				return content.UI.Properties.Height;
			}

			// Used by Masonry layout
			this.collectionViewHeightForCellAtIndexPath = (collectionView, indexPath, args) => {
				var mashupDefinition = BMCollectionViewMashupDefinitionCache[indexPath.object[this.cellMashupNameField!]] || this.definitionForMashupNamed(indexPath.object[this.cellMashupNameField!], {atomic: YES}) as BMCollectionViewDeserializedMashupEntityDefinition;

				var content = mashupDefinition._BMDeserializedContent || (mashupDefinition._BMDeserializedContent = JSON.parse(mashupDefinition.mashupContent) as TWMashupDefinition);

				return content.UI.Properties.Height;
			}
		}
		// Create the handlers for dynamic sizes if they are set
		else if (this.cellWidthField || this.cellHeightField) {
			this.collectionViewSizeForCellAtIndexPath = (collectionView, indexPath) => {
				return BMSizeMake((this.cellWidthField && indexPath.object[this.cellWidthField]) || cellWidth, (this.cellHeightField && indexPath.object[this.cellHeightField]) || cellHeight);
			}

			this.collectionViewRowHeightForCellAtIndexPath = (collectionView, indexPath) => {
				return (this.cellHeightField && indexPath.object[this.cellHeightField]) || cellHeight;
			}

			this.collectionViewHeightForCellAtIndexPath = (collectionView, indexPath, args) => {
				return (this.cellHeightField && indexPath.object[this.cellHeightField]) || cellHeight;
			}
		}
		else if (this.getProperty('CellMashupHasIntrinsicSize')) {
			this.collectionViewSizeForCellAtIndexPath = (collectionView, indexPath) => {
				return collectionView.measuredSizeOfCellAtIndexPath(indexPath);
			}

			this.collectionViewRowHeightForCellAtIndexPath = (collectionView, indexPath) => {
				return collectionView.measuredSizeOfCellAtIndexPath(indexPath).height;
			}

			this.collectionViewHeightForCellAtIndexPath = (collectionView, indexPath, args) => {
				return collectionView.measuredSizeOfCellAtIndexPath(indexPath).height;
			}
		}
		
		if (layout === 'flow') {
			this.collectionView.layout = this.createFlowLayout();
		}
		else if (layout === 'masonry') {
			this.collectionView.layout = this.createMasonryLayout();
		}
		else if (layout === 'table') {
			this.collectionView.layout = this.createTableLayout();
		}
		else if (layout === 'stack') {
			this.collectionView.layout = this.createStackLayout();
		}
		else if (layout === 'tile') {
			this.collectionView.layout = this.createTileLayout();
		}
		
		this.collectionView.delegate = this;
		this.collectionView.identityComparator = (o1, o2) => {
			if (!o1 && !o2) return YES;
			if (!o1 || !o2) return NO;
			
			return o1[this.UIDField] === o2[this.UIDField];
		};
        this.cellMashupName = this.getProperty('CellMashupName');
        
        if (this.cellMashupName && !BMCollectionViewMashupDefinitionCache[this.cellMashupName]) {
            await BMCollectionViewDefinitionForMashupNamed(this.cellMashupName, {atomic: NO});
        }
		
		this.canSelectCells = this.getProperty('CanSelectCells');
		this.canSelectMultipleCells = this.getProperty('CanSelectMultipleCells');
		this.multipleSelectionType = BMCollectionViewCellMultipleSelectionType[this.getProperty('CellMultipleSelectionType') || 'Disabled'];
		
		this.scrollsToSelectedCell = this.getProperty('ScrollsToSelectedCell');
		this.autoSelectsFirstCell = this.getProperty('AutoSelectsFirstCell');
		
		this.cellMashupNameSelected = this.getProperty('CellMashupNameSelected');
		this.cellMashupSelectedField = this.getProperty('CellMashupSelectedField');
		this.cellStyle = TW.getStyleFromStyleDefinition(this.getProperty('CellStyle')) || {backgroundColor: 'rgba(0, 0, 0, 0)'};
		this.cellStyleSelected = TW.getStyleFromStyleDefinition(this.getProperty('CellStyleSelected')) || this.cellStyle;
		if (!this.cellStyleSelected.backgroundColor) {
			this.cellStyleSelected = this.cellStyle;
		}

        if (this.cellMashupNameSelected && BMCollectionViewMashupDefinitionCache[this.cellMashupNameSelected]) {
            await !BMCollectionViewDefinitionForMashupNamed(this.cellMashupNameSelected, {atomic: NO});
        }

		if (this.cellStyle && this.cellStyle.backgroundColor) {
			this.cellStyleColor = BMColorMakeWithString(this.cellStyle.backgroundColor)!;
		}
		
		this.usesRipple = this.getProperty('UsesRipple');
		this.rippleStyle = this.getProperty('RippleStyle') || {backgroundColor: 'rgba(0, 0, 0, 0)'};
		if (this.rippleStyle) this.rippleStyle = TW.getStyleFromStyleDefinition(this.rippleStyle);
		this.cellBorderRadius = this.getProperty('CellBorderRadius');
		
		this.cellBoxShadow = this.getProperty('CellBoxShadow');
		
		this.emptyMashupName = this.getProperty('EmptyMashupName');
		if (this.emptyMashupName) await BMCollectionViewDefinitionForMashupNamed(this.emptyMashupName, {atomic: NO});
		
		if (this.cellStyleSelected && this.cellStyleSelected.backgroundColor) {
			this.cellStyleSelectedColor = BMColorMakeWithString(this.cellStyleSelected.backgroundColor)!;	
		}
		
		try {
			this.cellMashupPropertyBinding = JSON.parse(this.getProperty('CellMashupPropertyBinding'));
		}
		catch (e) {
			this.cellMashupPropertyBinding = {};
		}
		
		// Load the inline data manipulation data shape if it was specified
		if (this.getProperty('DataShape')) {
            let self = this;
            TW.Runtime.GetDataShapeInfo(this.getProperty('DataShape'), function (info) {
                if (!self.dataShape) self.dataShape = info;
            });
		}
		
		this.cellMashupEditingParameter = this.getProperty('CellMashupEditingParameter');
		this.cellMashupNameEditing = this.getProperty('CellMashupNameEditing');

        if (this.cellMashupNameEditing && BMCollectionViewMashupDefinitionCache[this.cellMashupNameEditing]) {
            await !BMCollectionViewDefinitionForMashupNamed(this.cellMashupNameEditing, {atomic: NO});
        }
		
		this.sortField = this.getProperty('SortField');
		
		var hoverStyle = TW.getStyleFromStyleDefinition(this.getProperty('CellStyleHover'));
		var activeStyle = TW.getStyleFromStyleDefinition(this.getProperty('CellStyleActive'));
		
		var hoverStyleBlockText;
		
		if (hoverStyle && hoverStyle.backgroundColor) {
			hoverStyleBlockText = '<style>\
						#' + this.jqElementId + ' .BMCollectionViewCellHoverable {transition: background-color .1s ease;}\
						#' + this.jqElementId + ' .BMCollectionViewCellHoverable:hover {background-color: ' + hoverStyle.backgroundColor + ';}';
		}
		
		if (activeStyle && activeStyle.backgroundColor) {
			if (hoverStyleBlockText) {
				hoverStyleBlockText += '\
					#' + this.jqElementId + ' .BMCollectionViewCellHoverable:active {background-color: ' + activeStyle.backgroundColor + ';}';
			}
			else {
				hoverStyleBlockText = '<style>\
							#' + this.jqElementId + ' .BMCollectionViewCellHoverable {transition: background-color .1s ease;}\
							#' + this.jqElementId + ' .BMCollectionViewCellHoverable:active {background-color: ' + activeStyle.backgroundColor + ';}';
			}
		}

		if (scrollbarCSS) {
			if (!hoverStyleBlockText) hoverStyleBlockText = '<style>\n';
			hoverStyleBlockText += scrollbarCSS;
		}
		
		if (hoverStyleBlockText) {		
			hoverStyleBlockText += '</style>';
			this.hoverStyleBlock = $(hoverStyleBlockText);
			$(document.head as HTMLElement).append(this.hoverStyleBlock);
		}

		if (this.getProperty('DirectLink')) {
			BMDirectLinkConnectWithDelegate(self);
		}

		this.initLinkedCollectionView();

		afterRenderedResolve();
		this.afterRendered = undefined;
	}
	
	async initLinkedCollectionView() {
		if (this.getProperty('LinkedCollectionView')) {
			await 0;
			const collectionViewWidget = BMFindWidget({named: this.getProperty('LinkedCollectionView'), inMashup: this.mashup}) as BMCollectionViewWidget;
			if (collectionViewWidget && this.linkedCollectionViews.indexOf(collectionViewWidget) == -1) {
				this.linkedCollectionViews.push(collectionViewWidget);
				collectionViewWidget.linkedCollectionViews.push(this);
				// Also link the layout queues
				(this.collectionView as any).cellLayoutQueue = (collectionViewWidget.collectionView as any).cellLayoutQueue;
			}
		}
	}

	// @deprecated Superseded by handleResponsiveWidgets
    resize(width: number, height: number): void {
        this.collectionView && this.collectionView.resized();
    }
	
	/**
	 * @deprecated Deprecated in favor of currentDataUpdate.
	 * If an update arrives while the collection view is already processing another update request
	 * that update info is temporarily saved to this variable until the collection view has finished processing its current update request.
	 * When that update request is finished, this update is then applied and the pendingDataUpdate variable is reset to undefined.
	 */
	pendingDataUpdate?: TWUpdatePropertyInfo;

	/**
	 * A promise that resolves when the current data update finishes processing.
	 */
	currentDataUpdate?: Promise<void>;


	/**
	 * Invoked by the Thingworx runtime whenever any of this widget's bound properties was updated as a result of a binding.
	 * @param updatePropertyInfo <TWUpdatePropertyInfo>		            An object describing this property update.
     * @param updatePropertyInfo.ForceUpdateLayout <Boolean, nullable>  Defaults to NO. If set to YES, the layout will be updated regardless of whether the internal rules
     *                                                                  would normally prevent this.
	 * {
     *	@param completionHandler <void ^(), nullable>		            If this is a data update and this parameter is specified, this is a handler that will be invoked 
     *                                                                  when the data update completes.
	 * }
	 */
    async updateProperty(updatePropertyInfo: any, args?: {completionHandler?: (_?: any) => void}): Promise<void> {
        var property = updatePropertyInfo.TargetProperty;

		// Don't process property updates until afterRender has finished executing
		if (this.afterRendered) {
			await this.afterRendered;
		}

		if (property == 'Data') {

			// If the property update is badly formatted, ignore
			if (!updatePropertyInfo.SinglePropertyValue && !updatePropertyInfo.RawSinglePropertyValue) {
				console.warn('[BMCollectionView] Ignoring badly formatted property update.');
				return;
			}

			this.pendingDataUpdate = updatePropertyInfo;

			// Await for the currently running data update to finish before attempting to process another one
			if (this.currentDataUpdate) await this.currentDataUpdate;

			// Await for collection view to finish its current update operation
			await (this.collectionView as any)._dataUpdatePromise;

			// Stop if a newer data update is pending
			if (this.pendingDataUpdate != updatePropertyInfo) return;

			var currentDataUpdateResolve;
			this.currentDataUpdate = new Promise(function (resolve, reject) {
				currentDataUpdateResolve = resolve;
			});

			this.currentDataUpdate = this.currentDataUpdate;

            // When CellMashupNameField is used, request all new mashups before actually committing the data update
            if (this.cellMashupNameField) {
                for (var object of updatePropertyInfo.ActualDataRows) {
                    if (!BMCollectionViewMashupDefinitionCache[object[this.cellMashupNameField]]) {
                        await BMCollectionViewDefinitionForMashupNamed(object[this.cellMashupNameField], {atomic: NO});
                    }
                }
            }
			

			// Await for the current drag operation to finish
			if (!updatePropertyInfo.ForceUpdateLayout) await this.collectionView.interactiveMovement;


			// Retain a reference to the data shape to allow the collection view to create data
			if (updatePropertyInfo.RawSinglePropertyValue || updatePropertyInfo.SinglePropertyValue) {
				let potentialDataShape = (updatePropertyInfo.RawSinglePropertyValue || updatePropertyInfo.SinglePropertyValue).dataShape;
				if (potentialDataShape) this.dataShape = potentialDataShape;
			}
			
			/* This is now handled by awaiting on promises
			// If the collection view is already updating its data, delay the data update
			// until after the update animation is finished.
			if (collectionView.isUpdatingData) {
				pendingDataUpdate = updatePropertyInfo;
				return;
			}
			*/
			
			let indexPathHeights = [];
			
			var shouldUpdateLayout = YES;
			
			this.oldData = this.data;
			// If the new data is undefined, construct a new empty infotable for it
			// Additionally, always work on a copy, in case the contained mashups try to change any properties
			this.data = (updatePropertyInfo.ActualDataRows || []);
			this.newData = this.data;
			
			if (this.sortField) {
				// Keep a reference to the original data and create a copy of it
				// which will be sorted according to the SortField
				this.originalData = this.data;
				this.newData = this.newData.slice();
				
				// When using the sortField, the original indexes have to be retained in order for selections to work reliably
				var newDataLength = this.newData.length;
				for (var i = 0; i < newDataLength; i++) {
					if (isNaN(this.data[i]._BMCollectionViewInfoTableIndex)) this.newData[i]._BMCollectionViewInfoTableIndex = i;
				}
				
				// Sort the data by the sortField when it is defined
				this.newData.sort((o1, o2) => {
					return (this.sortAscending ? (o1[this.sortField!] < o2[this.sortField!]) : (o1[this.sortField!] > o2[this.sortField!])) ? 1 : (o1[this.sortField!] == o2[this.sortField!] ? 0 : -1);
				});
				
				this.data = this.newData;
			}
			
			if (this.filter) {
				
			}
			
			// The layout should not update if the data sets have the same items in the same positions
			if (this.oldData && this.oldData.length == this.newData.length && !updatePropertyInfo.ForceUpdateLayout) {
				shouldUpdateLayout = NO;
				
				var dataLength = this.data.length;
				for (var i = 0; i < dataLength; i++) {
					// If any single item changes position or section, the layout must be invalidated
					var oldObject = this.oldData[i];
					var newObject = this.newData[i];
					
					// If the UIDs are different at any index, the layout must be invalidated
					if (this.UIDField && oldObject[this.UIDField] !== newObject[this.UIDField]) {
						shouldUpdateLayout = YES;
						break;
					}
					
					// If an object changes section, the layout must be invalidated
					if (this.sectionField && oldObject[this.sectionField] !== newObject[this.sectionField]) {
						shouldUpdateLayout = YES;
						break;
					}

					// When using data-driven dimensions and any dimension changes, the layout must be invalidated
					if (this.cellWidthField && oldObject[this.cellWidthField] != newObject[this.cellWidthField]) {
						shouldUpdateLayout = YES;
						break;
					}
					if (this.cellHeightField && oldObject[this.cellHeightField] != newObject[this.cellHeightField]) {
						shouldUpdateLayout = YES;
						break;
					}
					
				}
			}
			
			// When using the section field, the data structure is changed from a flat array to a two-level array of sections containing the actual data rows
			if (this.sectionField) {
				this.oldSections = this.sections;
				this.sections = [];
				
				var sectionIdentifiers = {};
				var dataLength = this.data.length;
				let sectionIndex = -1;
				for (var i = 0; i < dataLength; i++) {
					if (isNaN(this.data[i]._BMCollectionViewInfoTableIndex)) this.data[i]._BMCollectionViewInfoTableIndex = i;
					var sectionIdentifier = this.data[i][this.sectionField];
					let section;
					
					if (!(section = sectionIdentifiers[sectionIdentifier])) {
						section = sectionIdentifiers[sectionIdentifier] = {rows: [], identifier: sectionIdentifier};
						sectionIndex++;
					}
					
					// When using the sortField, the index no longer matches the object's original position within the Infotable
					// so the _BMCollectionViewInfoTableIndex property is used instead
					this.data[i]._BMCollectionViewSectionIndex = sectionIndex;
					this.data[i]._BMCollectionViewRowIndex = section.rows.length;
					section.rows.push({data: this.data[i], index: this.sortField ? this.data[i]._BMCollectionViewInfoTableIndex : i});
				}
				
				var keys = Object.keys(sectionIdentifiers);
				for (var i = 0; i < keys.length; i++) {
					this.sections.push(sectionIdentifiers[keys[i]]);
				}
				
				this.newSections = this.sections;
				
			}
			
			this.updateEditingIndexPaths();
			
			// Update the exposed outgoing data infotable
			var outgoingInfotable = {
				dataShape: (updatePropertyInfo.RawSinglePropertyValue || updatePropertyInfo.SinglePropertyValue).dataShape,
				rows: this.data
			};
			this.setProperty('Data', outgoingInfotable);
			
			if (!this.collectionView.dataSet) {
				this.collectionView.dataSet = this;
				
				// Select the first index path if there is no selection and the behavior is enabled
				if (this.autoSelectsFirstCell && this.collectionView.selectedIndexPaths.length === 0 && this.numberOfSections() && this.numberOfObjectsInSectionAtIndex(0)) {
					this.collectionView.selectedIndexPaths = [this.indexPathForObjectAtRow(0, {inSectionAtIndex: 0})];
				}
				
				// After updating the data, update the selection as well
				this.updateThingworxSelection();

				// Resolve the promise allowing the collection view to process aditional data updates
				currentDataUpdateResolve();
			}
			else {
				this.collectionView.updateEntireDataAnimated(YES, {updateLayout: shouldUpdateLayout, completionHandler: () => {
					this.oldData = undefined;
					this.oldSections = undefined;
					
					// Select the first index path if there is no selection and the behavior is enabled
					if (this.autoSelectsFirstCell && this.collectionView.selectedIndexPaths.length === 0 && this.numberOfSections() && this.numberOfObjectsInSectionAtIndex(0)) {
						this.collectionView.selectedIndexPaths = [this.indexPathForObjectAtRow(0, {inSectionAtIndex: 0})];
					}
					
					// After updating the data, update the selection as well
					this.updateThingworxSelection();

					if (args && args.completionHandler) {
						// If a completion handler was specified, invoke it here
						args.completionHandler();
					}

					// Resolve the promise allowing the collection view to process aditional data updates
					currentDataUpdateResolve();

					// Invalidate the dragging index paths, in case any sections were removed
					if (updatePropertyInfo.ForceUpdateLayout) {
						this.collectionView.invalidateDraggingIndexPaths();
					}
				
					/*
					// If there was a data update pending, apply it here
					if (pendingDataUpdate) {
						// For synchronous non-layout updates, the pendingDataUpdate property must be cleared before performing the actual update
						// otherwise, this function will be inifitely called recursively
						var data = pendingDataUpdate;
						pendingDataUpdate = undefined;
						self.updateProperty(data, args);
					}
					else if (args && args.completionHandler) {
						// If a completion handler was specified, invoke it here
						args.completionHandler();
					}
					*/
				}});
			}
			
			return;
		}
		else if (property == 'Layout') {
			var layoutName = updatePropertyInfo.SinglePropertyValue;
			
			if (layoutName == 'flow') {
				let layout = this.createFlowLayout();
				
				this.collectionView.setLayout(layout, {animated: YES});
			}
			else if (layoutName == 'masonry') {
				let layout = this.createMasonryLayout();
				
				this.collectionView.setLayout(layout, {animated: YES});
			}
			else if (layoutName == 'table') {
				let layout = this.createTableLayout();
				
				this.collectionView.setLayout(layout, {animated: YES});
			}
			else if (layoutName == 'stack') {
				let layout = this.createStackLayout();
				
				this.collectionView.setLayout(layout, {animated: YES});
			}
			else if (layoutName == 'tile') {
				let layout = this.createTileLayout();
				
				this.collectionView.setLayout(layout, {animated: YES});
			}
			
			return;
		}
		else if (property == 'SortField') {
			this.sortField = updatePropertyInfo.SinglePropertyValue;

			if (!this.collectionView.dataSet) return;
			
			this.updateProperty({TargetProperty: 'Data', ActualDataRows: this.data, SinglePropertyValue: this.getProperty('Data')});
		}
		else if (property == 'SortAscending') {
			let value = (updatePropertyInfo.SinglePropertyValue === 'false' ? false : updatePropertyInfo.SinglePropertyValue);
			this.sortAscending = value;

			if (!this.collectionView.dataSet) return;
			
			if (!this.sortField) return;
			this.updateProperty({TargetProperty: 'Data', ActualDataRows: this.data, SinglePropertyValue: this.getProperty('Data')});
		}
		else if (property == 'CreateIndex') {
			this.setProperty('CreateIndex', updatePropertyInfo.SinglePropertyValue);
		}
		else if (property == 'DeletionUID') {
			this.setProperty('DeletionUID', updatePropertyInfo.SinglePropertyValue);
		}
		else if (property == 'CanDragCells') {
			let value = (updatePropertyInfo.SinglePropertyValue === 'false' ? false : updatePropertyInfo.SinglePropertyValue);
			this.setProperty('CanDragCells', value);
		}
		else if (property == 'Filter') {
			//this.filter = BMPredicateMakeWithQuery(updatePropertyInfo.SinglePropertyValue);
			
			//this.updateProperty({TargetProperty: 'Data', ActualDataRows: this.data, SinglePropertyValue: self.getProperty('Data')});
		}
		else if (property in this.globalDataShape) {
			let value = updatePropertyInfo.RawSinglePropertyValue || updatePropertyInfo.SinglePropertyValue;
			this.setProperty(property, value);
			this.globalParameters[property] = value;
		}
		
    }


	
	/**
	 * Invoked whenever any bound global property's value is updated as a result of a binding.
	 * @param property <String>						The name of the global property.
	 * {
	 * 	@param didUpdateToValue <AnyObject>			The global property's new value.
	 * }
	 */
	globalProperty(property: string, args: {didUpdateToValue: any}): void {
		this.collectionView.enumerateVisibleCellsWithBlock(((cell: BMCollectionViewMashupCell, type: BMCollectionViewLayoutAttributesType, identifier: string) => {
		
			// Skip supplementary and decoration views
			if (type != BMCollectionViewLayoutAttributesType.Cell) return;
			
			cell._globalParameters[property] = args.didUpdateToValue;
			var mashup = cell._mashupInstance;
		
			try {
				if (mashup) mashup.BM_setParameterInternal(property, args.didUpdateToValue);
			}
			catch (e) {
				console.log(e);
			}
		}) as any);
	};


    /**
     * Temporarily set to `YES` while the selection is being updated to prevent
     * the widget fighting for selection with other widgets that update their selection.
     */
    selectionUpdateBlocked: boolean = NO;


	/**
	 * Invoked by the platform whenevery any other widget updates the selection of any of this widget's bound infotables.
	 * @param propertyName <String>				The name of the infotable property whose selection was updated.
	 * @param selectedRows <[AnyObject]>		An array of selected row objects.
	 * @param selectedRowIndices <[Int]>		An array of selected row indices.
	 */
	handleSelectionUpdate(propertyName: string, selectedRows: any[], selectedRowIndices: number[]) {
		// Construct the selection indexPaths
		var selectedIndexPaths: BMIndexPath[] = [];
		
		// When the sortField, the object has to be looked up using the _BMCollectionViewInfoTableIndex property
		if (this.sortField) {
			for (var i = 0; i < selectedRowIndices.length; i++) {
				for (var j = 0; j < this.data.length; j++) {
					if (this.data[j]._BMCollectionViewInfoTableIndex === selectedRowIndices[i]) {
						var indexPath = this.indexPathForObject(this.data[j]);
						if (indexPath) selectedIndexPaths.push(indexPath);
					}
				}
			}
		}
		else {
			for (var i = 0; i < selectedRowIndices.length; i++) {
				var indexPath = this.indexPathForObject(this.data[selectedRowIndices[i]]);
				if (indexPath) selectedIndexPaths.push(indexPath);
			}
		}
		
		// Select the new indexes in the collection view.
		this.selectionUpdateBlocked = YES;
		this.collectionView.selectedIndexPaths = selectedIndexPaths;
		this.selectionUpdateBlocked = NO;
		
		// Update the HasSelectedCells property to match the current selection state
		var hasSelectedCells = !!selectedIndexPaths.length;
		if (hasSelectedCells != this.getProperty('HasSelectedCells')) {
			this.setProperty('HasSelectedCells', hasSelectedCells);
		}

		// Update the SelectedCellsCount property to match the current selection state
		this.setProperty('SelectedCellsCount', this.collectionView.selectedIndexPaths.length);
		
		// Scroll to the first selected cell is this behavior is enabled
		if (this.scrollsToSelectedCell) {
			if (this.collectionView.selectedIndexPaths.length) {
				this.collectionView.scrollToCellAtIndexPath(this.collectionView.selectedIndexPaths[0], {withVerticalGravity: BMCollectionViewScrollingGravityVertical.Center, horizontalGravity: BMCollectionViewScrollingGravityHorizontal.Center, animated: YES});
			}
		}
		
    };
    
    @TWService('Deselect')
    deselect(): void {
        this.collectionView.selectedIndexPaths = [];
        this.updateThingworxSelection();
    }

    @TWService('SelectAll')
    selectAll(): void {
        if (this.sectionField) {
            var indexPaths: BMIndexPath[] = [];
            var sectionsLength = this.numberOfSections();
            for (var j = 0; j < sectionsLength; j++) {
                var length = this.numberOfObjectsInSectionAtIndex(j);
                for (var i = 0; i < length; i++) {
                    indexPaths.push(this.indexPathForObjectAtRow(i, {inSectionAtIndex: j}));
                }
            }
            
            this.collectionView.selectedIndexPaths = indexPaths;
            this.updateThingworxSelection();
        }
        else {
            var indexPaths: BMIndexPath[] = [];
            var length = this.numberOfObjectsInSectionAtIndex(0);
            for (var i = 0; i < length; i++) {
                indexPaths.push(this.indexPathForObjectAtRow(i, {inSectionAtIndex: 0}));
            }
            
            this.collectionView.selectedIndexPaths = indexPaths;
            this.updateThingworxSelection();
        }
    }

    @TWService('InvalidateLayout')
    invalidateLayout(): void {
        this.collectionView.invalidateLayout();
    }

    @TWService('CreateItemAtBeginning') 
    createItemAtBeginning(): void {
        this.insertItemAtIndex(0);
    }

    @TWService('CreateItemAtEnd') 
    createItemAtEnd(): void {
        this.insertItemAtIndex(-1);
    }

    @TWService('CreateItemAtIndex') 
    createItemAtIndex(): void {
        this.insertItemAtIndex(this.getProperty('CreationIndex'));
    }

    @TWService('DeleteItem') 
    deleteItem(): void {
        this.deleteItemWithUID(this.getProperty('DeletionUID'));
    }

    @TWService('BeginSelectionMode') 
    beginSelectionMode(): void {
        this.isSelectionModeEnabled = YES;
        this.setProperty('CellMultipleSelectionModeEnabled', this.isSelectionModeEnabled);
    }

    @TWService('FinishSelectionMode') 
    finishSelectionMode(): void {
        this.isSelectionModeEnabled = NO;
        this.collectionView.selectedIndexPaths = [];
        this.updateThingworxSelection();
        this.setProperty('CellMultipleSelectionModeEnabled', this.isSelectionModeEnabled);
    }

    // #endregion

    // #region BMCollectionViewDataSource


	// @override - BMCollectionViewDataSet
	numberOfSections(): number {
		// The existence of sectionField implies that sections is also nonnull
		return this.sectionField ? this.sections!.length : (this.data.length ? 1 : 0);
	};
	
	// @override - BMCollectionViewDataSet
	numberOfObjectsInSectionAtIndex(i: number): number {
		// The existence of sectionField implies that sections is also nonnull
		return this.sectionField ? this.sections![i].rows.length : this.data.length;
	};
				
	// @override - BMCollectionViewDataSet
	indexPathForObjectAtRow(row: number, options: {inSectionAtIndex: number}): BMIndexPath {
		if (this.sectionField) {
			return BMIndexPathMakeWithRow(row, {section: options.inSectionAtIndex, forObject: this.sections![options.inSectionAtIndex].rows[row].data});
		}
		else {
			return BMIndexPathMakeWithRow(row, {section: options.inSectionAtIndex, forObject: this.data[row]});
		}
	};
	
	// @override - BMCollectionViewDataSet
	indexPathForObject(object: any): any {
		if (this.sectionField) {
			// First attempt a fast look up
			let sectionObject = this.sections![object._BMCollectionViewSectionIndex];
			if (sectionObject) {
				let dataObject = sectionObject.rows[object._BMCollectionViewRowIndex];
				if (dataObject && dataObject.data[this.UIDField] == object[this.UIDField]) {
					return BMIndexPathMakeWithRow(object._BMCollectionViewRowIndex, {
						section: object._BMCollectionViewSectionIndex, 
						forObject: this.sections![object._BMCollectionViewSectionIndex].rows[object._BMCollectionViewRowIndex].data
					});
				}
				
			}
			for (var section = 0; section < this.sections!.length; section++) {
				var sectionData = this.sections![section].rows;
				for (var row = 0; row < sectionData.length; row++) {
					if (sectionData[row].data[this.UIDField] == object[this.UIDField]) return BMIndexPathMakeWithRow(row, {section: section, forObject: sectionData[row].data});
				}
			}
		}
		else {
			var section = 0;
			
			for (var i = 0; i < this.data.length; i++) {
				if (this.data[i][this.UIDField] == object[this.UIDField]) return BMIndexPathMakeWithRow(i, {section: section, forObject: this.data[i]});
			}
			
		}

		//throw new Error('Unexpected indexPath requested for object ' + object);
	};

	// @override - BMCollectionViewDataSet
	identifierForIndexPath(indexPath: BMIndexPath): string {
		return indexPath.object[this.UIDField];
	}
	
	/**
	 * Invoked internally to retrieve the mashup name for the cell at the given index path.
	 * This will take the CellMashupNameField, CellMashupNameSelected and CellMashupNameEditing states into account
	 * as well the index path's selection and editing states.
	 * @param indexPath <BMIndexPath>				The index path.
	 * {
	 * 	@param selected <Boolean, nullable>			Defaults to this index path's selected state. Whether or not the index path is selected.
	 * 	@param editing <Boolean, nullable>			Defaults to this index path's editing state. Whether or not the index path is editing.
	 * }
	 * @return <String>								The mashup name.
	 */
	_mashupNameForCellAtIndexPath(indexPath: BMIndexPath, args?: {selected?: boolean, editing?: boolean}): string {
		args = args || {};

		// CellMashupNameField has priority over all other mashup names and disables the selection and editing mashups.
		if (this.cellMashupNameField) return this.mashupNameForCellAtIndexPath!(indexPath) || this.cellMashupName!;

		if (args.selected === undefined) args.selected = this.collectionView.isCellAtIndexPathSelected(indexPath);
		if (args.editing === undefined) args.editing = this.isCellAtIndexPathEditing(indexPath);

		// Otherwise editing has priority over selection
		if (args.editing && this.cellMashupNameEditing) return this.cellMashupNameEditing;
		// And selection has priority over the default mashup
		if (args.selected && this.cellMashupNameSelected) return this.cellMashupNameSelected;

		// If none of the fields or alternative mashup names are set, the default mashup name is used
		// If no default mashup name has been set, it is a configuration error
		return this.cellMashupName!;
	};
	
	// @override - BMCollectionViewDataSet
	cellForItemAtIndexPath(indexPath: BMIndexPath): BMCollectionViewMashupCell {
		var cell;
		var isSelected = this.collectionView.isCellAtIndexPathSelected(indexPath);
		var isEditing = this.isCellAtIndexPathEditing(indexPath);
		var mashup;

		// When using BMCollectionViewMashupCell the mashup name and reuse identifiers are always identical
        mashup = this._mashupNameForCellAtIndexPath(indexPath);
        cell = this.collectionView.dequeueCellForReuseIdentifier(mashup);
            
		if (cell.initialized) {
			cell.backgroundColor = (isSelected && BMColorMakeWithString(this.cellStyleSelected.backgroundColor)) ? 
										BMColorMakeWithString(this.cellStyleSelected.backgroundColor) : 
										BMColorMakeWithString(this.cellStyle.backgroundColor);

			cell.isSelected = isSelected;
			cell.isEditing = isEditing;

			this.updateCell(cell, {atIndexPath: indexPath});
		}
		else {
            cell.mashup = mashup;
            cell.pointer = this.getProperty('CellPointer');
            cell.rippleColor = BMColorMakeWithString(this.rippleStyle.backgroundColor);
            cell.usesRipple = this.usesRipple;
            if (this.cellBorderRadius) cell.node.style.borderRadius = this.cellBorderRadius;
            if (this.usesRipple || this.cellBorderRadius) {
                cell.node.style.overflow = 'hidden';
            }
            if (this.cellBoxShadow) cell.node.style.boxShadow = this.cellBoxShadow;
            cell._parameterMap = this.cellMashupPropertyBinding;
            cell.parameters = indexPath.object;
            cell._selectedParameter = this.cellMashupSelectedField;
            cell._editingParameter = this.cellMashupEditingParameter;
            cell.globalParameters = this.globalParameters;
            cell.backgroundColor = (isSelected && BMColorMakeWithString(this.cellStyleSelected.backgroundColor)) ? 
                                        BMColorMakeWithString(this.cellStyleSelected.backgroundColor) : 
                                        BMColorMakeWithString(this.cellStyle.backgroundColor);
            
            cell.isSelected = isSelected;
            cell.isEditing = isEditing;

            // Initialize the menu touch event handler if there are menu entries
            if (this.menuDefinition!.length) {
                this.initializeMenuTouchEventHandlersForCell(cell);
            }

            cell.initialized = YES;

            this.updateCell(cell, {atIndexPath: indexPath});
		}
		
		return cell;
	};
	
	// @override - BMCollectionViewDataSet
	updateCell(cell: BMCollectionViewMashupCell, options: {atIndexPath: BMIndexPath}): void {
		var indexPath = options.atIndexPath;
		
		if (this.cellMashupNameField && this._mashupNameForCellAtIndexPath(indexPath) != cell.mashup) {
			// Update the mashup instance if it has changed
			(<any>cell)._parameters = this.sectionField ? this.sections![indexPath.section].rows[indexPath.row].data : this.data[indexPath.row];
			cell.mashup = this._mashupNameForCellAtIndexPath(indexPath);
		}
        else {
			// Otherwise just update the parameters
			cell.parameters = this.sectionField ? this.sections![indexPath.section].rows[indexPath.row].data : this.data[indexPath.row];
		}

        // updateCell is not invoked in cases where the cell's selection or editing state changes - these are handled elsewhere
	};
	
	/**
	 * @deprecated - Not invoked when using custom cell classes.
	 * @override - BMCollectionViewDataSet
	 */
	contentsForCellWithReuseIdentifier(identifier: string) : $ | string {
		var contents = $('<div class="BMCollectionViewCell BMCollectionViewCellHoverable" style="width: 100%; height: 100%; cursor: ' + (this.getProperty('CellPointer')) + ';">');
		
		return contents;
	};
	
	// @override - BMCollectionViewDelegate
	collectionViewDidRenderCell(collectionView: BMManagedCollectionView, cell: BMCollectionViewMashupCell): void {
		var indexPath = cell.indexPath;
		
		// If this cell is being edited, retain it indefinitely until the editing is finished
		// As this method is invoked when a cell becomes visible on the screen, this will only be invoked once
		// if this index path becomes editing while off-screen.
		if (this.isCellAtIndexPathEditing(indexPath)) {
			cell.retain();
		}
        
        /*
		// Let the delegate know that this cell has been bound to a new index path.
		if (!cell.BM_mashup) return;
		if (cell.BM_mashup.BMCellDelegate && cell.BM_mashup.BMCellDelegate.collectionViewDidAssignIndexPath) {
			cell.BM_mashup.BMCellDelegate.collectionViewDidAssignIndexPath(collectionView, cell.indexPath);
        }
        */
		
		cell.BM_recycled = NO;
		
	};
	

	/**
	 * @deprecated - Handled internally by BMCollectionViewMashupCell
	 * @override - BMCollectionViewDelegate
	 */
	collectionViewWillRecycleCell(collectionView: BMManagedCollectionView, cell: BMCollectionViewMashupCell) {
		cell.BM_recycled = YES;
	};

	/**
	 * Invoked internally to retrieve the mashup name corresponding to the supplementary at the given index path.
	 * @param identifier <String> 				The type of supplementary view.
	 * {
	 * 	@param atIndexPath <BMIndexPath>		The supplementary view's index path.
	 * }
	 * @return <String, nullable>				The name of the mashup that will be used as this supplementary view's contents,
	 * 											or undefined if the supplementary view has an unsupported identifier.
	 */
	_mashupNameForSupplementaryViewWithIdentifier(identifier: string, args: {atIndexPath: BMIndexPath}): string | undefined {
		if (identifier == BMCollectionViewTableLayoutSupplementaryView.Header) return this.headerMashupName!;
		if (identifier == BMCollectionViewTableLayoutSupplementaryView.Footer) return this.footerMashupName!;
		if (identifier == BMCollectionViewTableLayoutSupplementaryView.Empty) return this.emptyMashupName!;
	}
	
	// @override - BMCollectionViewDataSet
	cellForSupplementaryViewWithIdentifier(identifier: string, options: {atIndexPath: BMIndexPath}): BMCollectionViewMashupCell {
		var cell = this.collectionView.dequeueCellForSupplementaryViewWithIdentifier(identifier) as BMCollectionViewMashupCell;
		
		if (cell.initialized) {
			this.updateSupplementaryView(cell, {withIdentifier: identifier, atIndexPath: options.atIndexPath});
		}
		else {
            cell.mashup = this._mashupNameForSupplementaryViewWithIdentifier(identifier, options);
            if (identifier == BMCollectionViewTableLayoutSupplementaryView.Header) {
                if (this.headerMashupSectionProperty) cell._parameterMap = {[this.headerMashupSectionProperty]: this.headerMashupSectionProperty};
            }
            else if (identifier == BMCollectionViewTableLayoutSupplementaryView.Footer) {
                if (this.footerMashupSectionProperty) cell._parameterMap = {[this.footerMashupSectionProperty]: this.footerMashupSectionProperty};
            }
            else if (identifier == BMCollectionViewTableLayoutSupplementaryView.Empty) {
                cell._parameterMap = {};
            }

            cell.initialized = YES;

            this.updateSupplementaryView(cell, {withIdentifier: identifier, atIndexPath: options.atIndexPath});
		}
		
		return cell;
	};
	
	/**
	 * @deprecated Not invoked when custom cell classes are used.
	 * @override - BMCollectionViewDataSet
	 */
	contentsForSupplementaryViewWithIdentifier(identifier: string): $ | string {
		var contents = $('<div class="BMCollectionViewCell" style="width: 100%; height: 100%;">');
		
		return contents;
	};
	
	// @override - BMCollectionViewDataSet
	updateSupplementaryView(cell: BMCollectionViewMashupCell, options: {withIdentifier: string, atIndexPath: BMIndexPath}) {
		var indexPath = options.atIndexPath;
		
		var sectionIdentifier = (cell.reuseIdentifier !== BMCollectionViewTableLayoutSupplementaryView.Empty && this.sections![options.atIndexPath.section].identifier);

		try {
            if (cell.reuseIdentifier == BMCollectionViewTableLayoutSupplementaryView.Header) {
                if (this.headerMashupSectionProperty) cell.parameters = {[this.headerMashupSectionProperty]: sectionIdentifier};
            }
            else if (cell.reuseIdentifier == BMCollectionViewTableLayoutSupplementaryView.Footer) {
                if (this.footerMashupSectionProperty) cell.parameters = {[this.footerMashupSectionProperty]: sectionIdentifier};
            }
				
			// This data set does not handle the update for the empty supplementary view
		}
		catch (e) {
			
		}
	};

	
	// @override - BMCollectionViewDataSet
	useOldData(use: boolean) {
		if (use) {
			this.data = this.oldData!;
			this.sections = this.oldSections;
		}
		else {
			this.data = this.newData!;
			this.sections = this.newSections;
		}
	};
	
	// @override - BMCollectionViewDataSet
	isUsingOldData(): boolean {
		return this.data === this.oldData;
	}
	

	// @override - BMCollectionViewDataSet
	async insertItems(items: any[], args: {toIndexPath: BMIndexPath}): Promise<void> {
		let targetIndex;
		let targetIndexPath = args.toIndexPath;

		items.forEach(item => {
			item[this.UIDField] = this.uniqueIdentifier();
			if (targetIndexPath.object && this.sectionField) {
				item[this.sectionField] = targetIndexPath.object[this.sectionField];
			}
		});

		if (this.sectionField) {
			targetIndex = this.sections![targetIndexPath.section].rows[targetIndexPath.row || 0].index;
		}
		else {
			targetIndex = this.sortField ? this.data[targetIndexPath.row || 0]._BMCollectionViewInfoTableIndex : targetIndexPath.row;
		}

		let newData;
		if (this.getProperty('CellAcceptPolicy') == 'Replace') {
			newData = [];
			targetIndex = 0;
		}
		else {
			newData = this.data ? this.data.slice() : [];
		}

		newData.splice(targetIndex + 1, 0, ...items);

		let newDataInfotable = this.data ? this.getProperty('Data') : {dataShape: this.dataShape};
		newDataInfotable.rows = newData;

		await this.updateProperty({TargetProperty: 'Data', SinglePropertyValue: newDataInfotable, ActualDataRows: newData, ForceUpdateLayout: YES});

		this.jqElement.triggerHandler('CollectionViewDidAcceptDroppedItems');
	};

	// @override - BMCollectionViewDataSet
	moveItemFromIndexPath(indexPath: BMIndexPath, args: {toIndexPath: BMIndexPath}): boolean {
		if (this.collectionView.isUpdatingData || !this.getProperty('CanMoveCells')) return NO;

		let targetIndexPath = args.toIndexPath;
		let targetIndex;
		let sourceIndex;

		if (this.sectionField) {
			targetIndex = this.sections![targetIndexPath.section].rows[targetIndexPath.row].index;
			sourceIndex = this.sections![indexPath.section].rows[indexPath.row].index;
		}
		else {
			targetIndex = this.sortField ? this.data[targetIndexPath.row]._BMCollectionViewInfoTableIndex : targetIndexPath.row;
			sourceIndex = this.sortField ? this.data[indexPath.row]._BMCollectionViewInfoTableIndex : indexPath.row;
		}

		let item = this.data[sourceIndex];

		// Change the section as well if needed and allowed
		if (this.sectionField) if (item[this.sectionField] != this.data[targetIndex][this.sectionField]) {
			if (!this.getProperty('CanMoveCellsAcrossSections')) return NO;

			item[this.sectionField] = this.data[targetIndex][this.sectionField];

			// If section changes and new index is less than target index, target index has to shift back by 1
			if (sourceIndex < targetIndex) targetIndex--;
		}

		let newData = this.data.slice();

		newData.splice(sourceIndex, 1);
		newData.splice(targetIndex, 0, item);

		let newDataInfotable = this.getProperty('Data');
		newDataInfotable.rows = newData;

		this.updateProperty({TargetProperty: 'Data', SinglePropertyValue: newDataInfotable, ActualDataRows: newData, ForceUpdateLayout: YES}, {completionHandler: _ => {	
			this.jqElement.triggerHandler('CollectionViewDidMoveItems');
		}});

		return YES;
	};

	// @override - BMCollectionViewDataSet
	moveItemsFromIndexPaths(indexPaths: BMIndexPath[], args: {toIndexPath: BMIndexPath}): BMIndexPath[] {
		if (!this.getProperty('CanMoveCells')) return indexPaths;
		if (this.collectionView.isUpdatingData) return indexPaths;

		let targetIndexPath = args.toIndexPath;
		let finalIndexPaths: BMIndexPath[] = [];

		let newData = this.data.slice();

		if (this.sectionField) {
			let finalIndexPath = targetIndexPath.copy();
			// The target index paths will all end up in ascending order
			// The final index paths will be as follows:
			//		- for each index path in the same section whose row is less than the target index path
			//			the target index path decreases by 1, except for the first occurence
			let firstOccurence = YES;
			let items: any[] = [];
			let targetItem = this.data[this.sections![targetIndexPath.section].rows[targetIndexPath.row].index];
			indexPaths.forEach(indexPath => {
				if (indexPath.section == targetIndexPath.section && indexPath.row < targetIndexPath.row) {
					if (firstOccurence) {
						firstOccurence = NO;
					}
					else {
						finalIndexPath.row--;
					}
				}
				
				items.push(newData[this.sections![indexPath.section].rows[indexPath.row].index]);
			});

			// Remove the items from the data array
			items.forEach(item => {
				newData.splice(newData.indexOf(item), 1);
			});

			// Push the items back into the data array at the correct positions
			newData.splice(firstOccurence ? newData.indexOf(targetItem) : newData.indexOf(targetItem) + 1, 0, ...items);

			// Supply the index paths back to collection view
			items.forEach(item => {
				if (this.getProperty('CanMoveCellsAcrossSections')) item[this.sectionField!] = targetItem[this.sectionField!];
				let itemIndexPath = finalIndexPath.copy();
				itemIndexPath.object = item;

				finalIndexPath.row++;

				finalIndexPaths.push(itemIndexPath);
			});

		}
		else {
			//targetIndex = this.sortField ? this.data[targetIndexPath.row]._BMCollectionViewInfoTableIndex : targetIndexPath.row;

			let finalIndexPath = targetIndexPath.copy();
			// The target index paths will all end up in ascending order
			// The final index paths will be as follows:
			//		- for each index path in the same section whose row is less than the target index path
			//			the target index path decreases by 1, except for the first occurence
			let firstOccurence = YES;
			let items: any[] = [];
			let targetItem = this.data[targetIndexPath.row];
			indexPaths.forEach(indexPath => {
				if (indexPath.row < targetIndexPath.row) {
					if (firstOccurence) {
						firstOccurence = NO;
					}
					else {
						finalIndexPath.row--;
					}
				}
				
				items.push(newData[indexPath.row]);
			});

			// Remove the items from the data array
			items.forEach(item => {
				newData.splice(newData.indexOf(item), 1);
			});

			// Push the items back into the data array at the correct positions
			newData.splice(firstOccurence ? newData.indexOf(targetItem) : newData.indexOf(targetItem) + 1, 0, ...items);

			// Supply the index paths back to collection view
			items.forEach(item => {
				let itemIndexPath = finalIndexPath.copy();
				itemIndexPath.object = item;

				finalIndexPath.row++;

				finalIndexPaths.push(itemIndexPath);
			});
		}

		let newDataInfotable = this.getProperty('Data');
		newDataInfotable.rows = newData;

		this.updateProperty({TargetProperty: 'Data', SinglePropertyValue: newDataInfotable, ActualDataRows: newData, ForceUpdateLayout: YES}, {completionHandler: _ => {	
			this.jqElement.triggerHandler('CollectionViewDidMoveItems');
		}});

		return finalIndexPaths;
	}

	// @override - BMCollectionViewDataSet
	async removeItemsAtIndexPaths(indexPaths: BMIndexPath[]) {
		let newData = this.data.slice();
		let indexes: number[] = [];

		indexPaths.forEach(indexPath => {
			let index;
			if (this.sectionField) {
				index = this.sections![indexPath.section].rows[indexPath.row].index;
			}
			else {
				index = this.sortField ? this.data[indexPath.row]._BMCollectionViewInfoTableIndex : indexPath.row;
			}

			indexes.push(index);
		});

		indexes.sort((i1, i2) => i2 - i1).forEach(index => newData.splice(index, 1));

		let newDataInfotable = this.getProperty('Data');
		newDataInfotable.rows = newData;

		await this.updateProperty({TargetProperty: 'Data', SinglePropertyValue: newDataInfotable, ActualDataRows: newData, ForceUpdateLayout: YES});

		this.jqElement.triggerHandler('CollectionViewDidRemoveItems');
	}
	

    // #endregion

    // #region BMCollectionViewDelegate

	// @override - BMCollectionViewDelegate
	collectionViewShouldRunIntroAnimation(): boolean {
		return this.getProperty('PlaysIntroAnimation');
	};

	// @override - BMCollectionViewDelegate
	collectionViewCanMoveCell(collectionView: BMManagedCollectionView, cell: BMCollectionViewMashupCell, args: {atIndexPath: BMIndexPath}): boolean {
		return this.getProperty('CanDragCells') && !this.sortField;
	};

	// @override - BMCollectionViewDelegate
	collectionViewWillBeginInteractiveMovementForCell(collectionView: BMManagedCollectionView, cell: BMCollectionViewMashupCell, {atIndexPath: indexPath}: {atIndexPath: BMIndexPath}) {
		this.triggerEvent('CollectionViewWillBeginInteractiveMovement', {withCell: cell});
	};

	collectionViewDidFinishInteractiveMovementForCell(collectionView: BMManagedCollectionView, cell: BMCollectionViewMashupCell, {atIndexPath: indexPath}: {atIndexPath: BMIndexPath}) {
		this.triggerEvent('CollectionViewDidFinishInteractiveMovement', {withCell: cell});
	};

	// @override - BMCollectionViewDelegate
	collectionViewCanRemoveItemsAtIndexPaths(collectionView: BMManagedCollectionView, indexPaths: BMIndexPath[]): boolean {
		return this.getProperty('CanRemoveCells');
	};

	// @override - BMCollectionViewDelegate
	collectionViewCanTransferItemsAtIndexPaths(collectionView: BMManagedCollectionView, indexPaths: BMIndexPath[]): boolean {
		return this.getProperty('CanTransferCells');
	};

	// @override - BMCollectionViewDelegate
	collectionViewTransferPolicyForItemsAtIndexPaths(collectionView: BMManagedCollectionView, indexPaths: BMIndexPath[]): BMCollectionViewTransferPolicy {
		return this.getProperty('CellTransferPolicy') || BMCollectionViewTransferPolicy.Copy;
	};

	// @override - BMCollectionViewDelegate
	collectionViewCanAcceptItems(collectionView: BMCollectionView, items: any[]) {
		if (!this.getProperty('CanAcceptCells')) return NO;

		// Disallow receiving items before the collection view is initialized 
		if (!this.collectionView) return NO;

		// If this collection view becomes a possible drop target before data loads
		// create a dummy infotable from the data shape property and initialize it
		if (!this.data || !this.collectionView.dataSet) {
			this.setProperty('PlaysIntroAnimation', NO);

			let newDataInfotable = {dataShape: this.dataShape, rows: []};

			this.updateProperty({TargetProperty: 'Data', SinglePropertyValue: newDataInfotable, ActualDataRows: newDataInfotable.rows, ForceUpdateLayout: YES});
		}

		// Check that the items have the correct data shape (at minimum the same fields as this collection view's data shape,
		// or a superset)
		let validDropTarget = YES;
		for (let key in this.dataShape.fieldDefinitions) {
			for (let i = 0; i < items.length; i++) {
				if (!(key in items[i])) {
					validDropTarget = NO;
					break;
				}
			}

			if (!validDropTarget) break;
		}

		return validDropTarget;
	};

	// @override - BMCollectionViewDelegate
	collectionViewAcceptPolicyForItems(collectionView: BMManagedCollectionView, indexPaths: BMIndexPath[]): BMCollectionViewAcceptPolicy {
		if (this.getProperty('CellAcceptPolicy') == 'Replace') {
			return BMCollectionViewAcceptPolicy.Copy;
		}
		return this.getProperty('CellAcceptPolicy') || BMCollectionViewAcceptPolicy.Copy;
    };
    

	// #region BMCollectionViewDelegate - selection handlers
	
	// @override - BMCollectionViewDelegate
	collectionViewCanSelectCellAtIndexPath(collectionView: BMCollectionView, indexPath: BMIndexPath): boolean {
		if (this.isSelectionModeEnabled) return YES;

		return this.canSelectCells && (this.canSelectMultipleCells || this.multipleSelectionType === BMCollectionViewCellMultipleSelectionType.ClickTap || !collectionView.isCellAtIndexPathSelected(indexPath));	
	};
	
	// @override - BMCollectionViewDelegate
	collectionViewCanDeselectCellAtIndexPath(collectionView: BMCollectionView, indexPath: BMIndexPath): boolean {
		if (this.isSelectionModeEnabled) return YES;

		return this.canSelectCells && (this.canSelectMultipleCells || this.multipleSelectionType === BMCollectionViewCellMultipleSelectionType.ClickTap);
	};
	
	// @override - BMCollectionViewDelegate
	collectionViewDidSelectCellAtIndexPath(collectionView: BMCollectionView, indexPath: BMIndexPath): void {
		var cell = collectionView.cellAtIndexPath(indexPath, {ofType: BMCellAttributesType.Cell}) as BMCollectionViewMashupCell;
		
		if (!this.canSelectMultipleCells && !this.isSelectionModeEnabled && !this.isCtrlPressed && this.multipleSelectionType !== BMCollectionViewCellMultipleSelectionType.ClickTap) {
			// In single selection mode, deselect all other index paths
            collectionView.selectedIndexPaths = [indexPath];
		}
		
		this.updateThingworxSelection();
		
		if (!cell) return;

        cell.isSelected = YES;
        //cell.node.classList.add('BMCollectionViewCellSelected');
        cell.backgroundColor = BMColorMakeWithString(this.cellStyleSelected.backgroundColor)!;
        cell.mashup = this._mashupNameForCellAtIndexPath(indexPath);
			
        return;
	};
	
	// @override - BMCollectionViewDelegate
	collectionViewDidDeselectCellAtIndexPath(collectionView: BMCollectionView, indexPath: BMIndexPath): void {
		var cell = collectionView.cellAtIndexPath(indexPath, {ofType: BMCellAttributesType.Cell}) as BMCollectionViewMashupCell;
		this.updateThingworxSelection();
		
        if (!cell) return;
        
        cell.isSelected = NO;
        //cell.node.classList.remove('BMCollectionViewCellSelected');
        cell.backgroundColor = BMColorMakeWithString(this.cellStyle.backgroundColor)!;
        cell.mashup = this._mashupNameForCellAtIndexPath(indexPath);
		
    };
    

	//#region Event and Selection Handlers
	// ******************************************** EVENT AND SELECTION HANDLERS ********************************************
	
	/**
	 * The cell currently hosting the context menu. Only one cell should host the context menu at a time.
	 */
	currentMenuCell?: BMCollectionViewMashupCell;
	
	/**
	 * Invoked to notify Thingworx of any selection changes.
	 */
	updateThingworxSelection(): void {
		if (this.selectionUpdateBlocked) return;
		var selectedIndexPaths = this.collectionView.selectedIndexPaths;
		
		var selectedDataIndices: number[] = [];
		for (var i = 0; i < selectedIndexPaths.length; i++) {
			if (!isNaN(selectedIndexPaths[i].object._BMCollectionViewInfoTableIndex)) {
				selectedDataIndices.push(selectedIndexPaths[i].object._BMCollectionViewInfoTableIndex);
				continue;
			}
			if (this.sectionField) {
				var indexPath = selectedIndexPaths[i];
				selectedDataIndices.push(this.sections![indexPath.section].rows[indexPath.row].index);
			}
			else {
				selectedDataIndices.push(this.sortField ? this.data[selectedIndexPaths[i].row]._BMCollectionViewInfoTableIndex : selectedIndexPaths[i].row);
			}
		}
		
		// Update the HasSelectedCells property to match the current selection state
		var hasSelectedCells = !!selectedDataIndices.length;
		if (hasSelectedCells != this.getProperty('HasSelectedCells')) {
			this.setProperty('HasSelectedCells', hasSelectedCells);
		}

		this.setProperty('SelectedCellsCount', this.collectionView.selectedIndexPaths.length);
		
		try {
			// This may fail in certain cases, e.g. if Data is bound to something other than a service or mashup parameter
			this.updateSelection('Data', selectedDataIndices);
		}
		catch (e) {
			console.error(e);
		}
	};
	
	// @override - BMCollectionViewDelegate
	collectionViewCanDoubleClickCell(collectionView: BMCollectionView, cell: BMCollectionViewMashupCell, options: {withEvent: $event}): boolean {
		return this.getProperty('_CanDoubleClick');
	}
	
	// @override - BMCollectionViewDelegate
	collectionViewCellWasClicked(collectionView: BMCollectionView, cell: BMCollectionViewMashupCell, args: {withEvent: $event}): boolean {
		if (this.currentMenuCell) {
			this.collapseMenuInCell(this.currentMenuCell, {animated: YES});
			this.currentMenuCell = undefined;
		}
		
		this.triggerEvent('CellWasClicked', {withCell: cell});

		if (this.multipleSelectionType === BMCollectionViewCellMultipleSelectionType.CtrlClick && this.canSelectCells) {
			// When a cell is clicked while holding ctrl, toggle its selection state
			if (args.withEvent.ctrlKey || args.withEvent.metaKey) {
				this.isCtrlPressed = YES;
				if (collectionView.isCellAtIndexPathSelected(cell.indexPath)) {
					collectionView.deselectCellAtIndexPath(cell.indexPath);
				}
				else {
					collectionView.selectCellAtIndexPath(cell.indexPath);
				}
				this.isCtrlPressed = NO;
				
				// For Ctrl-Clicking to select or deselect cells, inhibit the default behaviour
				return YES;
			}

			// Otherwise invoke the default behaviour which selects the cell and deselects all aother cells
        }
        
        return NO;
	};
	
	// @override - BMCollectionViewDelegate
	collectionViewCellWasDoubleClicked(collectionView: BMCollectionView, cell: BMCollectionViewMashupCell, options: {atIndexPath: BMIndexPath, withEvent: $event}): boolean {
		if (this.currentMenuCell) {
			this.collapseMenuInCell(this.currentMenuCell, {animated: YES});
			this.currentMenuCell = undefined;
		}
		
        this.triggerEvent('CellWasDoubleClicked', {withCell: cell});
        
        return NO;
	};
	
	// @override - BMCollectionViewDelegate
	collectionViewCellWasLongClicked(collectionView: BMCollectionView, cell: BMCollectionViewMashupCell, {atIndexPath: indexPath, withEvent: event}: {atIndexPath: BMIndexPath, withEvent: $event}): boolean {
		if (this.currentMenuCell) {
			this.collapseMenuInCell(this.currentMenuCell, {animated: YES});
			this.currentMenuCell = undefined;
		}
		
		this.triggerEvent('CellWasLongClicked', {withCell: cell});

		if (this.longClickSelectsCell) {
			if (collectionView.isCellAtIndexPathSelected(cell.indexPath)) {
				collectionView.deselectCellAtIndexPath(cell.indexPath);
			}
			else {
				collectionView.selectCellAtIndexPath(cell.indexPath);
			}

			return YES;
		}
		
		// Long click events originate from mousedown or touchstart events so this event type can be used to differentiate between taps and clicks
		if (event.type == 'touchstart') {
			// On mobiles, the default action for long tapping is to bring up the menu
			if (this.menuStateDefinition.length && this.menuUseBuiltin && this.menuKind != BMCollectionViewWidgetSlideMenuType.Slide) {
				this.showPopupMenuForCell(cell, {forEvent: event});
				return YES;
			}
		}
        
        return NO;
	}
	
	
	// @override - BMCollectionViewDelegate
	collectionViewCellWasRightClicked(collectionView: BMCollectionView, cell: BMCollectionViewMashupCell, options: {atIndexPath: BMIndexPath, withEvent: $event}): boolean {
		
		this.triggerEvent('CellWasRightClicked', {withCell: cell});
		
		if (!this.menuUseBuiltin) return this.canRightClick;
		
		if (this.currentMenuCell) {
			this.collapseMenuInCell(this.currentMenuCell, {animated: YES});		
			
			options.withEvent.preventDefault();
			options.withEvent.stopPropagation();
		}
		
		// When right clicking the current cell, just dismiss the menu
		if (cell == this.currentMenuCell) {
			this.currentMenuCell = undefined;
			return NO;
		}
		
		if (this.menuDefinition!.length) {
		
			if (this.menuKind == BMCollectionViewWidgetSlideMenuType.Slide) {
				this.currentMenuCell = cell;
				this.expandMenuInCell(cell, {animated: YES, forEvent: options.withEvent});
			}
			else {
				this.showPopupMenuForCell(cell, {forEvent: options.withEvent});
			}
			
			options.withEvent.preventDefault();
			options.withEvent.stopPropagation();
		}
		
		return this.canRightClick;
	}

	/**
	 * Temporarily set to true while scroll positions are being synced.
	 */
	private _blocksScrollPositionUpdates = NO;
	
	// @override - BMCollectionViewDelegate
	collectionViewBoundsDidChange(collectionView: BMCollectionView, bounds: BMRect): void {
		if (this.currentMenuCell) {
			this.collapseMenuInCell(this.currentMenuCell, {animated: YES});
			this.currentMenuCell = undefined;
		}

		// Updated linked collection views
		if (this.linkedCollectionViews.length) {
			this._blocksScrollPositionUpdates = YES;
			const scrollOffset = this.collectionView.scrollOffset;
			for (const collectionViewWidget of this.linkedCollectionViews) {
				collectionViewWidget.syncScrollPositionToPoint(scrollOffset);
			}
			this._blocksScrollPositionUpdates = NO;
		}
	}

	/**
	 * Invoked to synchronize this collection view's scroll position to another
	 * collection view's scroll position.
	 * This method will do nothing if this collection view is updating its data.
	 * @param point 	The point to which the collection view should scroll.
	 */
	syncScrollPositionToPoint(point: BMPoint) {
		// Don't update the scroll position if this is a recursive call or if collection view is busy updating data
		if (this._blocksScrollPositionUpdates || this.collectionView.isUpdatingData) return;

		point = point.copy();
		point.x = BMNumberByConstrainingNumberToBounds(point.x, 0, this.collectionView.size.width - this.collectionView.frame.size.width);
		point.y = BMNumberByConstrainingNumberToBounds(point.y, 0, this.collectionView.size.height - this.collectionView.frame.size.height);

		this.collectionView.scrollOffset = point;
	}
	
	/**
	 * Should be invoked to populate the event properties with the values from the given cell and trigger the specified event.
	 * @param event <String>		The event's name.
	 * {
	 *	@param withCell <BMCell>	The cell that should trigger this event.
	 * }
	 */
	triggerEvent(event: string, options: {withCell: BMCollectionViewCell}): void {
		if (window.event) {
			(window.event as any)._BMOriginalTarget = options.withCell.node;
		}

		var object = options.withCell.indexPath.object;
		
		// Retrieve the event data shape
		var dataShape = JSON.parse(this.getProperty('_EventDataShape') || '{}');
		var fields = Object.keys(dataShape);
		
		// Populate the event properties
		for (var i = 0; i < fields.length; i++) {
			this.setProperty('Event:' + fields[i], object[fields[i]]);
		}
		
		// Fire the event
		this.jqElement.triggerHandler(event);
	};

	// #endregion
	

    // #endregion

    
    // Handled by annotations
    serviceInvoked(name: string): void {}

    	
	//#region Menu
	// *************************** MENU AND MENU ENTRY GENERATORS *****************************
	
	/**
	 * Should be invoked to construct and return a new menu entry.
	 * @param name <String>							The menu entry's name.
	 * {
	 *	@param style <TWStyleDefinition>		The style definition to apply to this menu entry.
	 *	@param handler <void ^ (String)>		A handler that will be invoked when this menu option is selected.
	 *											This handler will receive the menu entry's name as its paramters.
	 * }
     * @return The menu entry.
	 */
	menuEntryWithName(name: string, options: {style: any, handler: (option: string) => void}): $ {
		
		var entry = $('<div class="BMCollectionViewMenuEntry"></div>');
		
		var icon = $('<div class="BMCollectionViewMenuEntryIcon"></div>');
		var iconSrc = options.style.image;
		
		icon.css({backgroundImage: 'url(' + iconSrc + ')', backgroundSize: this.menuIconSize + 'px', width: this.menuIconSize + 'px', height: this.menuIconSize + 'px'});
		
		switch (this.menuIconGravity) {
			case 'Left':
				entry.addClass('BMCollectionViewMenuEntryLeft');
				entry.text(name);
				entry.prepend(icon);
			break;
			case 'Right':
				entry.addClass('BMCollectionViewMenuEntryRight');
				entry.text(name);
				entry.append(icon);
			break;
			case 'Above':
				entry.addClass('BMCollectionViewMenuEntryAbove');
				icon.css({display: 'block'});
				entry.text(name);
				entry.prepend(icon);
			break;
			case 'Below':
				entry.addClass('BMCollectionViewMenuEntryBelow');
				icon.css({display: 'block'});
				entry.text(name);
				entry.append(icon);
			break;
		}
		
		var fontSize = TW.getTextSize(options.style.textSize).substring(11);
		fontSize = fontSize.substring(0, fontSize.length - 1);
		
		entry.css({
			'background-color': options.style.backgroundColor,
			color: options.style.foregroundColor,
			'font-size': fontSize
		});
		
		if (options.style.fontEmphasisBold) {
			entry.css({'font-weight': 'bold'});
		}
		
		if (options.style.fontEmphasisUnderline) {
			entry.css({'text-decoration': 'underline'});
		}
		
		if (options.style.fontEmphasisItalic) {
			entry.css({'font-style': 'italic'});
		}
		
		/*entry.on('click', function (event) {
			options.handler(name);
			event.stopPropagation();
		});*/
		
		// Stop the collection view events from stealing this entry's events
		entry.on('touchstart touchmove touchend mousedown mouseup mousemove click', function (event) { event.stopPropagation(); });

		// Use capture to prevent other elements from stealing the events
		var captureListener = function (event) {
			event.stopPropagation();
		};

		var clickListener = function (event) {
			options.handler(name);
			event.stopPropagation();
		};

		entry[0].addEventListener('touchstart', captureListener, YES);
		entry[0].addEventListener('touchmove', captureListener, YES);
		entry[0].addEventListener('touchend', captureListener, YES);
		entry[0].addEventListener('mousedown', captureListener, YES);
		entry[0].addEventListener('mouseup', captureListener, YES);
		entry[0].addEventListener('mousemove', captureListener, YES);
		entry[0].addEventListener('click', clickListener, YES);
		
		return entry;
		
	}
	
	/**
	 * Should be invoked to construct and return a menu.
	 * @param handler <void ^ (String)>		A handler that will be invoked whenever any menu option is selected. 
	 *										This handler will receive the selected menu entry's name as its paramters.
	 */
	renderMenuWithHandler(handler: (option: string) => void) {
		var menu = $('<div class="BMCollectionViewMenu">');
		var menuWrapper = $('<div class="BMCollectionViewMenuWrapper">');
		
		for (var i = 0; i < this.menuDefinition!.length; i++) {
			var style = TW.getStyleFromStyleDefinition(this.menuStateDefinition[i].defaultStyleDefinition);
			
			menu.append(this.menuEntryWithName(this.menuDefinition![i], {style: style, handler: handler}));
		}
		
		switch (this.menuOrientation) {
			case 'Horizontal':
				menu.addClass('BMCollectionViewMenuHorizontal');
			break;
			case 'Vertical':
				menu.addClass('BMCollectionViewMenuVertical');
			break;
		}
		
		menuWrapper.append(menu);
		return menuWrapper;
	}
	
	/**
	 * Should be invoked to collapse the menu in the given cell. If the given cell doesn't current host a menu, this method does nothing. 
	 * This action will cause the cell to be released at the end of the animation.
	 * @param cell <BMCell>						The cell from which to collapse the menu.
	 * {
	 *	@param animated <Boolean, nullable>		Defaults to NO. If set to YES, this change will be animated, otherwise it will be instant.
	 *	@param duration <Number, nullable>		Defaults to 300. If specified, this is the duration of the animation.
	 * }
	 */
	collapseMenuInCell(cell: BMCollectionViewMashupCell, options: {animated?: boolean, duration?: number}): void {
		if (!cell.BM_hasMenu) return;

		if (this.currentMenuCell == cell) this.currentMenuCell = undefined;

		const cellElement = $(cell.node);
		
		if (!options || !options.animated) {
			// If the change isn't animated, just instantly remove the menu and move the mashup back to its original position
			cellElement.children('.BMCollectionViewMenuWrapper').remove();
			BMHook(cellElement.children().eq(0), {translateX: '0px'});
			return;
		}
		
		var mashup = cellElement.children().eq(0);
		var oldMenuWrapper = cellElement.children('.BMCollectionViewMenuWrapper');
		
		var menu = oldMenuWrapper.children();
		var menuWidth: number = menu.outerWidth() || 0;
		
		// Slide the mashup in the cell back to its original position
		mashup.velocity('stop', NO as any).velocity({
			translateX: 0,
			translateZ: 0
		}, {
			duration: (options && options.duration) || 300,
			easing: 'easeInOutQuart',
			queue: NO,
			complete: function () {
				cell.release();
				cell.BM_hasMenu = NO;
				oldMenuWrapper.remove();
			}
		});
		
		// Slide the menu towards the right, outside the cell
		oldMenuWrapper.velocity('stop', NO).velocity({
			translateX: menuWidth + 'px',
			translateZ: 0
		}, {
			duration: (options && options.duration) || 300,
			easing: 'easeInOutQuart',
			queue: NO
		});
		
		if (this.menuOrientation == 'Horizontal') {
			// Additionally, for horizontal menus, compact the menu entries on top of eachother
			var menuEntries = menu.children();
			var menuEntriesLength = menuEntries.length;
			var menuEntryWidth = menuWidth / menuEntriesLength;
			for (var i = 0; i < menuEntriesLength; i++) {
				var menuEntry = menuEntries.eq(i);
				
				menuEntry.velocity('stop', NO).velocity({
					translateX: [(-menuEntryWidth * i) + 'px', '0px'],
					translateZ: 0				
				}, {
					duration: (options && options.duration) || 300,
					easing: 'easeInOutQuart',
					queue: NO
				});
			}
		}
	}
	
	/**
	 * Should be invoked to expand a new menu in the given cell. If the cell already has a menu, this method does nothing. 
	 * This action will cause the cell to be retained until the menu is dismissed.
	 * @param cell <BMCell>						The cell in which to expand a new menu.
	 * {
	 *	@param animated <Boolean, nullable>		Defaults to NO. If set to YES, this change will be animated, otherwise it will be instant.
	 *	@param duration <Number, nullable>		Defaults to 300. If specified, this is the duration of the animation.
	 *	@param inPlace <Boolean, nullable>		Defaults to NO. If set to YES, the menu will not be constructed and the cell's currently existing menu 
	 *											will be expanded instead.
	 *	@param forEvent <$event, nullable>		If this is requested in response to an event, this represents the event that triggered this action.
	 * }
	 */
	expandMenuInCell(cell: BMCollectionViewMashupCell, options: {animated?: boolean, duration?: number, inPlace?: boolean, forEvent?: $event}): void {
		var inPlace = options && options.inPlace;
		
		if (cell.BM_hasMenu && !inPlace) return;

		const cellElement = $(cell.node);
		
		if (inPlace) {
			// If the expand is to be performed in place, it expected that the cell already has a menu and is retained
			var menuWrapper = cellElement.find('.BMCollectionViewMenuWrapper') as $;
		}
		else {
			// Retain the cell and add a property that indicates that it does have a menu associated with it
			cell.BM_hasMenu = YES;
            cell.retain();
            
            let self = this;
			
			// Construct the menu and add it to the cell
			var menuWrapper = self.renderMenuWithHandler(function (name) {
				// Fire the menu controller event if it was defined
				if (cell._mashupInstance && cell._mashupInstance._BMCollectionViewMenuController) {
					cell._mashupInstance._BMCollectionViewMenuController.jqElement.triggerHandler('Event:' + name);
				}

				// Then fire the global event and collapse the menu
				self.triggerEvent('Menu:' + name, {withCell: cell});
				if (self.currentMenuCell === cell) self.collapseMenuInCell(cell, {animated: YES});
			});
			cellElement.append(menuWrapper);
		}
		
		var menu = menuWrapper.children();
		
		var menuWidth = menu.outerWidth() || 0;
		var mashup = cellElement.children().eq(0);
		
		if (!options || !options.animated) {
			// If the change is not animated, it is sufficient to just slide the mashup towards the left
			BMHook(mashup, {translateX: (- menuWidth) + 'px'});
			
			return;
		}
		
		if (!inPlace) {
			// Otherwise start with a hidden visibility for the menu wrapper, so it doesn't flash at its regular position before the animation starts
			menuWrapper.css({visibility: 'hidden'});
			
			// Apply the initial positioning to the menuWrapper
			BMHook(menuWrapper, {translateX: menuWidth + 'px'});
		}
		
		// Slide the mashup towards the left
		mashup.velocity('stop', NO).velocity({
			translateX: (- menuWidth) + 'px',
			translateZ: 0
		}, {
			duration: (options && options.duration) || 300,
			easing: 'easeInOutQuart',
			queue: NO
		});
		
		// Slide the menu from outside the cell to its usual position
		(menuWrapper.velocity('stop', NO) as any).velocity({
			translateX: '0px',
			translateZ: 0
		}, {
			duration: (options && options.duration) || 300,
			easing: 'easeInOutQuart',
			queue: NO,
			visibility: 'visible'
		});
		
		if (this.menuOrientation == 'Horizontal') {
			// Additionally, for horizontal menus, the entries will first be on top of eachother and slide towards their usual positions
			var menuEntries = menu.children();
			var menuEntriesLength = menuEntries.length;
			var menuEntryWidth = menuWidth / menuEntriesLength;
			for (var i = 0; i < menuEntriesLength; i++) {
				var menuEntry = menuEntries.eq(i);
				
				menuEntry.velocity('stop', NO).velocity({
					translateX: inPlace ? '0px' : ['0px', (-menuEntryWidth * i) + 'px'],
					translateZ: 0				
				}, {
					duration: (options && options.duration) || 300,
					easing: 'easeInOutQuart',
					queue: NO
				});
			}
		}
	}
	
	/**
	 * Should be invoked to show the popup menu for the given cell.
	 * @param cell <BMCollectionViewMashupCell>		The cell for which to show the menu.
	 * {
	 *	@param forEvent <$event, nullable>			If this is requested in response to an event, this represents the event that triggered this action.
	 * }
	 */
	showPopupMenuForCell(cell: BMCollectionViewMashupCell, {forEvent: event}: {forEvent?: $event | Event} = {}) {
		const items: BMMenuItem[] = [];

		const action = (item: BMMenuItem) => {
			// Fire the menu controller event if it was defined
			if (cell._mashupInstance && cell._mashupInstance._BMCollectionViewMenuController) {
				cell._mashupInstance._BMCollectionViewMenuController.jqElement.triggerHandler('Event:' + item.name);
			}

			// Then fire the global event and collapse the menu
			this.triggerEvent('Menu:' + item.name, {withCell: cell});
		};
		
		for (var i = 0; i < this.menuDefinition!.length; i++) {
			let image: string | undefined = undefined;
			if (this.menuStateDefinition[i].defaultStyleDefinition.image) {
				image = `/Thingworx/MediaEntities/${this.menuStateDefinition[i].defaultStyleDefinition.image}`;
			}
			items.push(BMMenuItem.menuItemWithName(this.menuDefinition![i], {action, icon: image}));
		}

		const menu = BMMenu.menuWithItems(items);

		let sourceEvent: MouseEvent | undefined;

		if (event && 'originalEvent' in event) {
			sourceEvent = event.originalEvent as MouseEvent;
		}
		else {
			sourceEvent = window.event! as MouseEvent;
		}

		if (sourceEvent) {
			if (sourceEvent.type == 'touchstart') {
				(menu as any).openFromNode(cell.node);
			}
			else {
				menu.openAtPoint(BMPointMake(sourceEvent.pageX, sourceEvent.pageY));
			}
		}
		else {
			menu.openAtPoint(BMRectMakeWithNodeFrame(cell.node).center);
		}
	}

	/**
	 * Should be invoked to set up the touch event handlers that implement the touch-based slide menu behaviours.
	 * @param cell <BMCell>				The cell for which to initialize the touch event handlers.
	 */
	initializeMenuTouchEventHandlersForCell(cell: BMCollectionViewMashupCell): boolean { // TODO: return value type?
		// Don't install event handlers if use builtin is disabled
		if (!this.menuUseBuiltin) return NO;

		// Don't install touch event handlers if menu type is not auto or slide
		if (this.menuKind == BMCollectionViewWidgetSlideMenuType.Popup) return NO;
							
		var startingX: number, startingY: number;
		var lastX: number, lastY: number;
		
		var direction: number;
		
		var steps: number;
		var isTrackingMenuEvent: boolean;
		
		var menuWrapper: $ | undefined, menu: $ | undefined, menuEntries: $ | undefined;
        var menuWidth: number;
        
		let self = this;
		
		const cellElement = $(cell.node);
		
		cellElement.on('touchstart.BMCollectionViewMenu', function (event) {
			if (cell == self.currentMenuCell) return;

			startingX = (event.originalEvent as TouchEvent).touches[0].pageX;
			startingY = (event.originalEvent as TouchEvent).touches[0].pageY;
				
			steps = 0;
			isTrackingMenuEvent = NO;
		});
		
		cellElement.on('touchmove.BMCollectionViewMenu', function (event) {
			if (cell == self.currentMenuCell) return;
			
			// Allow a few movement steps to make sure that this is a horizontal gesture rather than a vertical one
			// And that the horizontal direction is towards the left rather than towards the right
			steps++;
			
			// If this cell is already hosting a menu, don't allow it to open another one
			if (steps == 3 && self.currentMenuCell != cell) {
				// At 3 steps, it should be relatively safe to determine whether the gesture is a horizontal or vertical slide
				let x = (event.originalEvent as TouchEvent).touches[0].pageX;
				let y = (event.originalEvent as TouchEvent).touches[0].pageY;
				
				// It is also required for the event to go from right to left initially; past this, the gesture may move back and forth
				if (Math.abs(x - startingX) > Math.abs(y - startingY) && x < startingX) {
					isTrackingMenuEvent = YES;
				
					// Construct the menu which will be used for the remainder of this track
					cell.BM_hasMenu = YES;
					menuWrapper = self.renderMenuWithHandler(function (name) {
						// Fire the menu controller event if it was defined
						if (cell._mashupInstance && cell._mashupInstance._BMCollectionViewController) {
							cell._mashupInstance._BMCollectionViewController.jqElement.triggerHandler('Event:' + name);
						}
		
						// Then fire the global event and collapse the menu
						self.triggerEvent('Menu:' + name, {withCell: cell});
						if (self.currentMenuCell === cell) self.collapseMenuInCell(cell, {animated: YES});
					});
					menu = menuWrapper.children();
					menuEntries = menu.children();
					
					cellElement.append(menuWrapper);
					
					// The cell will be retained for the duration of this event tracking; if an update happens before this tracking is finalized,
					// the collection will completely discard this cell
					cell.retain();
					
					menuWidth = menu.outerWidth() || 0;
					
					// Quickly collapse the current menu if it exists
					if (self.currentMenuCell) {
						self.collapseMenuInCell(self.currentMenuCell, {animated: YES, duration: 200});
					}
				}
				
			}
			
			if (isTrackingMenuEvent) {
				let x = (event.originalEvent as TouchEvent).touches[0].pageX;
				let y = (event.originalEvent as TouchEvent).touches[0].pageY;
				
				direction = x - lastX;
				
				// Take control of the event while tracking menu events;
				// By stopping propagation, this event will not reach the collection view, preventing scrolling for the duration of the menu tracking
				event.stopPropagation();
				event.preventDefault();
				
				// Slide over the menu and mashup, but only towards the right
				var displacement = Math.max(startingX - x, 0);
				
				// Slide over the menu; the menu itself should never slide past its final position
				BMHook(menuWrapper!, {translateX: Math.max(menuWidth - displacement, 0) + 'px'});
				
				// The mashup may slide past its final position, but it should generate greater resistance once it passes that position
				BMHook(cellElement.children().eq(0), {translateX: -displacement + Math.max((displacement - menuWidth) / 2, 0) + 'px'});
				
				if (self.menuOrientation == 'Horizontal') {
					// Additionally, for horizontal menus, the entries will first be on top of eachother and slide towards their usual positions
					var menuEntriesLength = menuEntries!.length;
					var menuEntryWidth = menuWidth / menuEntriesLength;
					var displacementPercentage = BMNumberByConstrainingNumberToBounds(displacement / menuWidth, 0, 1);
					console.log('Raw displacement is ' + (displacement / menuWidth));
					for (var i = 0; i < menuEntriesLength; i++) {
						var menuEntry = menuEntries!.eq(i);
						
						BMHook(menuEntry, {translateX: (-menuEntryWidth * i) + (menuEntryWidth * i * displacementPercentage) + 'px'});
					}
				}
				
				// Store the current touch X and Y position
				// These will be used in the touchend handler to determine the final direction of the gesture
				lastX = x;
				lastY = y;
			}
		});
		
		cellElement.on('touchend.BMCollectionViewMenu', function (event) {
			if (cell == self.currentMenuCell) return;
			if (!isTrackingMenuEvent) return;
			
			if (direction > 0) {
				// If the direction is positive, the gesture moves towards the right and the menu should be closed
				// This will also release the cell at the end of the animation
				self.collapseMenuInCell(cell, {animated: YES, duration: 200});
				
				// Clear the menu references so the garbage collector can reclaim their contents
				menuWrapper = undefined;
				menu = undefined;
				menuEntries = undefined;
			}
			else {
				// Otherwise the menu should be fully expanded
				self.currentMenuCell = cell;
				self.expandMenuInCell(cell, {animated: YES, duration: 200, inPlace: YES});
			}
			
		});

		return NO;
	}
	//#endregion
	
	//#region Menu Controller
	// *************************** CELL MENU CONTROLLER OUTLETS *****************************
	
	/**
	 * Should be invoked by cell menu controller to expand the menu in their cell.
	 * @param cell <BMCell>				The cell in which to expand the menu.
	 */
	requestExpandMenuInCell(cell: BMCollectionViewMashupCell): void {
		
		if (this.currentMenuCell != cell) {
			if (this.currentMenuCell) this.collapseMenuInCell(this.currentMenuCell, {animated: YES});	
		
			if (this.menuDefinition!.length) {
				if (this.menuKind == BMCollectionViewWidgetSlideMenuType.Popup) {
					this.showPopupMenuForCell(cell);
				}
				else if (this.menuKind == BMCollectionViewWidgetSlideMenuType.Slide) {
					this.currentMenuCell = cell;
				
					this.expandMenuInCell(cell, {animated: YES});
				}
				else {
					if (window.event && (window.event as MouseEvent).button == 2) {
						this.showPopupMenuForCell(cell);
					}
					else {
						this.currentMenuCell = cell;
					
						this.expandMenuInCell(cell, {animated: YES});
					}
				}
			}	
			
		}
		
	}
	
	/**
	 * Should be invoked by cell menu controller to collapse the menu in their cell.
	 * @param cell <BMCell>				The cell in which to collapse the menu.
	 */
	requestCollapseMenuInCell(cell: BMCollectionViewMashupCell): void {
		
		if (this.currentMenuCell == cell) {
			this.collapseMenuInCell(this.currentMenuCell, {animated: YES});	
			this.currentMenuCell = undefined;			
		}
		
	}
	
	/**
	 * Should be invoked by cell menu controller to toggle the menu in their cell.
	 * @param cell <BMCell>				The cell in which to toggle the menu.
	 */
	requestToggleMenuInCell(cell: BMCollectionViewMashupCell): void {
		
		if (this.currentMenuCell == cell) {
			this.requestCollapseMenuInCell(cell);			
		}
		else {
			this.requestExpandMenuInCell(cell);
		}
		
	}
	//#endregion
	
	//#region Data Manipulation
	// *************************** DATA MANIPULATION METHODS *****************************
	
	// The index paths currently being edited.
	editingIndexPaths: BMIndexPath[] = []; // <[BMIndexPath]>
	
	/**
	 * Invoked when the data set updates. Updates the index paths being edited to point to the correct rows and sections.
	 */
	updateEditingIndexPaths() {
		for (var i = 0; i < this.editingIndexPaths.length; i++) {
			var indexPath = this.indexPathForObject(this.editingIndexPaths[i].object);
			if (indexPath) {
				this.editingIndexPaths[i] = indexPath;
			}
			else {
				this.editingIndexPaths.splice(i, 1);
				i--;
			}
		}
	}
	
	/**
	 * Marks the cell at the specified index path as being edited.
	 * If the cell is visible and the editing mashup is specified, the cell is refreshed.
	 * @param indexPath <BMIndexPath>		The index path to begin editing.
	 */
	beginEditingCellAtIndexPath (indexPath: BMIndexPath): void {
		this.editingIndexPaths.push(indexPath);
		
		var cell = this.collectionView.cellAtIndexPath(indexPath) as BMCollectionViewMashupCell;

        if (cell && !cell.isEditing) {
            cell.isEditing = YES;
            cell.retain();
            cell.mashup = this._mashupNameForCellAtIndexPath(indexPath, {editing: YES});
        }
	};
	
	/**
	 * Marks the cell at the specified index path as not being edited.
	 * If the cell is visible and the editing mashup is specified, the cell is refreshed.
	 * @param indexPath <BMIndexPath>		The index path to finish editing.
	 */
	finishEditingCellAtIndexPath(indexPath: BMIndexPath): void {
		// Find the index path in the editing index paths
		for (var i = 0; i < this.editingIndexPaths.length; i++) {
			var editingIndexPath = this.editingIndexPaths[i];
			
			if (indexPath.isLooselyEqualToIndexPath(editingIndexPath, {usingComparator: this.collectionView.identityComparator as any})) {
				
				// Remove the index path from the editing index paths list
				this.editingIndexPaths.splice(i, 1);
				
				var cell = this.collectionView.cellAtIndexPath(indexPath) as BMCollectionViewMashupCell;

                if (cell && cell.isEditing) {
					cell.isEditing = NO;
					if (this.cellMashupEditingParameter) {
						
					}
                    cell.release();
                    cell.mashup = this._mashupNameForCellAtIndexPath(indexPath, {editing: NO});
                }

			}
		}
	};
	
	/**
	 * Returns YES if the cell at the specified index path is being edited.
	 * @param indexPath <BMIndexPath>		The index path to verify.
	 * @return <Boolean>					YES if the cell at specified index path is being edited, NO otherwise.
	 */
	isCellAtIndexPathEditing(indexPath: BMIndexPath): boolean {
		for (var i = 0; i < this.editingIndexPaths.length; i++) {
			if (indexPath.isLooselyEqualToIndexPath(this.editingIndexPaths[i], {usingComparator: this.collectionView.identityComparator as any})) {
				return YES;
			}
		}
		
		return NO;
	};

	/**
	 * Constructs and returns a new item based on the data shape. The item's fields will use
	 * the default values defined in the data shape, with the exception of the identifier field for which
	 * a new unique value will be generated.
	 * @return		An object.
	 */
	defaultItem(): any {
		// Cannot create items without a predefined data shape
		if (!this.dataShape) return;

		const newItem: any = {};
		for (const key in this.dataShape.fieldDefinitions) {
			if (key == this.UIDField) {
				newItem[key] = this.uniqueIdentifier();
			}
			else {
				newItem[key] = (this.dataShape.fieldDefinitions[key] as any).aspects.defaultValue;
			}
		}

		return newItem;

	}
	
	/**
	 * Creates a new item and inserts it into the data set at the specified index, then updates the collection view.
	 * @param index <Integer>				The data integer at which to insert the new item.
	 */
	async insertItemAtIndex(index: number): Promise<void> {
		// Cannot create items without a predefined data shape
		if (!this.dataShape) return;

		if (!this.collectionView) await this.afterRendered;
		
		// If the data has not been set yet, create it now
		var newData;
		if (!this.data || !this.collectionView.dataSet) {
			newData = {
				dataShape: this.dataShape,
				rows: []
			}
			
			// If data has not been set, skip the intro animation and immediately assign the data source
			this.setProperty('PlaysIntroAnimation', NO);
			this.updateProperty({TargetProperty: 'Data', SinglePropertyValue: newData, ActualDataRows: []});
		}
		else {
			newData = {
				dataShape: this.dataShape,
				rows: this.data.slice()
			}
		}
		
		// Create and insert the item
		var newItem = this.defaultItem();
		
		newData.rows.splice(index == -1 ? newData.rows.length : index, 0, newItem);
        
        let self = this;

		// Publish the data update
		this.updateProperty({TargetProperty: 'Data', SinglePropertyValue: newData, ActualDataRows: newData.rows}, {completionHandler: function () {
			// And mark the newly created cell as editing
			self.beginEditingCellAtIndexPath(self.indexPathForObject(newItem));
		}});
	};
	
	/**
	 * Deletes the item with the given UID, then updates the collection view.
	 * @param uid <AnyObject>			The UID of the item to delete.
	 */
	deleteItemWithUID(uid: any): void {
		if (!this.data || !this.dataShape) return;
		
		for (var i = 0; i < this.data.length; i++) {
			if (this.data[i][this.UIDField] == uid) {
				var newData = {
					dataShape: this.dataShape,
					rows: this.data.slice()
				};
				
				newData.rows.splice(i, 1);
				
				this.updateProperty({
					TargetProperty: 'Data',
					SinglePropertyValue: newData,
					ActualDataRows: newData.rows
				});
				
				return;
			}
		}
	};
	
	
	/**
	 * Generates and returns an identifier that is guaranteed to be unique for the current data set.
	 * @return <AnyObject, nullable>			A unique identifier, or undefined if there is no data shape defined or if the UID field is of an unsupported type.
	 */
	uniqueIdentifier(): any {
		
		if (!this.dataShape) return;
		
		var baseType = this.dataShape.fieldDefinitions[this.UIDField].baseType;
		if (baseType == 'STRING' || baseType == 'GUID') {
			// For strings, generate an UUID
			return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
				var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
			    return v.toString(16);
			});
		}
		else if (baseType == 'NUMBER' || baseType == 'INTEGER') {
			// For numbers, return one number over the highest UID in the data set
			return this.data.reduce(function (max, value) {
				return value > max ? value : max;
			}, 0) + 1;
		}
		
	};
	//#endregion
    
    
	//#region Widget Prototype Overrides
	// *************************** WIDGET.APPENDTO() *****************************

	
	/**
	 * @override - TWWidget
	 * Invoked by the platform whenever this widget has to recompute the layout for itself and other contained widgets.
	 * Unlike the regular handleResponsiveWidgets method collection view will always resize its contents without waiting.
	 * @param doItNow <Boolean, nullable>			Defaults to NO. Ignored by this implementation.
	 */
    handleResponsiveWidgets(doItNow: boolean): void {
		if (this._coreUIView) return;
        if (this.collectionView) this.collectionView.resized();

        /*this.getWidgets().forEach(function(widget: TWRuntimeWidget) {
            widget.handleResponsiveWidgets(YES);
        });*/
    };
	
	/**
	 * @override - TWWidget
	 * Invoked by the platform to construct the DOM elements needed for this widget and add them to the page.
	 * This method overwrites the default appendTo to optimize it for the collection view's configuration.
	 * @param container <$>											The jQuery container in which the widget should be added.
	 * @param mashup <TWMashup>										The mashup to which this widget belongs.
	 * @param fastWidgetAppend <void ^($, TWMashup), nullable>		When appendTo is invoked by a widget that supports laying out its child widgets using
	 * 																fastWidgetAppend, this parameter will be initialized to a reference to the fastWidgetAppend
	 * 																function, making it possible for this widget to use it for its children widgets.
	 */
	appendTo(container: any, mashup: any, fastWidgetAppend?: boolean): void {
        let self = this as any;

		// Create a unique ID for this widget and assign it to the jqElementId property
		var ID = TW.Runtime.Workspace.Mashups.Current.rootName + "_" + self.properties.Id;
		self.jqElementId = ID;
		
		// Get the property attributes
		var runtimeProperties = self.runtimeProperties();
		self.propertyAttributes = runtimeProperties.propertyAttributes || {};
		
		// Data loading and error are not supported by this method
		runtimeProperties.needsDataLoadingAndError = NO;
		runtimeProperties.needsError = NO;
		self.properties.ShowDataLoading = NO;
		
		// Set up the mashup reference
		self.mashup = TW.Runtime.Workspace.Mashups.Current;
		self.idOfThisMashup = TW.Runtime.HtmlIdOfCurrentlyLoadedMashup;
		self.idOfThisElement = self.properties.Id;

		// NOTE: Collection view does not have localizable properties -- all strings are defined in the data source and target mashups

		// NOTE: Collection view is not a mashup so it doesn't need to handle mashup styles

		// Determine whether this collection view is in a responsive container
		var isResponsive = self.properties.ResponsiveLayout;

		// The layout CSS is generated based on whether this widget is responsive or not
		var layoutCSS;
		if (isResponsive) {
			// Responsive widgets fill their container from the top-left corner
			layoutCSS = {
				width: '100%',
				height: '100%',
				position: 'absolute',
				left: '0px',
				top: '0px'	
			};
		}
		else {
			// Non-responsive widgets have variable sizes and positions
			layoutCSS = {
				width: self.properties.Width + 'px',
				height: self.properties.Height + 'px',
				position: 'absolute',
				left: (this._coreUIView && this._coreUIView.superview) ? '0px' : self.properties.Left + 'px',
				top: (this._coreUIView && this._coreUIView.superview) ? '0px' : self.properties.Top + 'px'	
			};
		}
		
		// NOTE: Labels are not supported by the collection view.
		
		// Obtain the HTML representation of this widget
		var widgetElement;
		if (this._coreUIView) {
			widgetElement = $((<any>this._coreUIView).node);

			this.subviewMap[self.properties.Id] = <any>this._coreUIView;
		}
		else {
			widgetElement = $(self.renderHtml())
		}

		// Set up the initial CustomClass
		if (this.getProperty('CustomClass')) {
			widgetElement.addClass(this.getProperty('CustomClass'));
		}
		
		// Set up the ID and layout of the element
		widgetElement.attr('id', ID);
		widgetElement.css(layoutCSS);
		
		// The bounding box and jQuery element are identical for the collection view
		this.jqElement = widgetElement;
		this.boundingBox = widgetElement;
		
		// Add the widget element to the container
		container.append(widgetElement);
		
		// Add data structures to the jQuery element
		widgetElement.data('widget', this);
		widgetElement.data('properties', self.properties);
		
		// Invoke afterRender
		if (this.afterRender) {
			// All responsive widgets should have their sizing properties initialized before invoking afterRender
			if (self.properties.ResponsiveLayout || self.properties.supportsAutoResize) {
				self.properties.Width = widgetElement.outerWidth();
				self.properties.Height = widgetElement.outerHeight();
			}
			
			this.afterRender();
		}
		
		// NOTE: this method does not support older versions of internet explorer

		// NOTE: collection view does not have contained widgets

		
		// Set up the z-index
		// To keep things consistent with the rest of the platform, 1500 is added to all non-mashup z-indexes, with a maximum value of 6500
		if (self.properties['Z-index']) {
			widgetElement.css('z-index', Math.min(self.properties['Z-index'] + 1500, 6500));
		}

		// NOTE: collection view does not support borders

		// NOTE: collection view does not support afterWidgetsRendered
		
		// Hide the collection view if it is not visible
		if (!self.properties.Visible) {
			widgetElement.hide();
		}
		
		// NOTE: dashboards are not supported as the collection view is not a dashboard
		// NOTE: page mashup containers are not supported as the collection view is not page mashup container
		
		// Set up the handle selection update handler
		self.lastSelectionUpdateCount = 0;
		
		// Find and enumerate this widget's bindings, looking for 'All Data' bindings.
		var bindings = this.mashup.findDataBindingsByTargetAreaAndId('UI', self.properties.Id);
		$.each(bindings, function (index, binding) {
			var isBoundToSelectedRows = TW.Runtime.isBindingBoundToSelectedRows(this);
			
			if (!isBoundToSelectedRows && this.PropertyMaps[0].TargetPropertyBaseType === 'INFOTABLE') {
				// If this binding is an 'All Data' infotable binding, register this widget as an observer for selected rows
				self.mashup.dataMgr.addSelectedRowsForWidgetHandleSelectionUpdateSubscription(binding, function (sourceId, selectedRows, selectedRowIndices) {
					// Only notify if the selection update comes from a different widget
					if (sourceId !== self.jqElementId) {
						self.handleSelectionUpdate(binding.PropertyMaps[0].TargetProperty, selectedRows, selectedRowIndices);
					}
				});
			}
		});
	};
	//#endregion
	
	//#region Direct Link
	// *************************************** DIRECT LINK *****************************************

	directLinkDidFailConnection(): void {

	};

	directLinkDidDisconnect(): void {

	};

	directLinkDidReceiveMessage(message: any): void {
        let self = this;

		try {
			message = JSON.parse(message);

			if (message.key == 'SortField' || message.key == 'SortAscending') {
				self.updateProperty({TargetProperty: message.key, SinglePropertyValue: message.value, RawSinglePropertyValue: message.value});
				return;
			}

			self.setProperty(message.key, message.value);
			
			var layout = self.getProperty('Layout');
			if (layout === 'flow') {
				self.collectionView.setLayout(self.createFlowLayout(), {animated: YES});
			}
			else if (layout === 'masonry') {
				self.collectionView.setLayout(self.createMasonryLayout(), {animated: YES});
			}
			else if (layout === 'table') {
				self.collectionView.setLayout(self.createTableLayout(), {animated: YES});
			}
			else if (layout === 'stack') {
				this.collectionView.setLayout(self.createStackLayout(), {animated: YES});
			}
			else if (layout === 'tile') {
				this.collectionView.setLayout(self.createTileLayout(), {animated: YES});
			}
		}
		catch (e) {

		}
	}

    get directLinkUUID(): string {
        return this.getProperty('DirectLinkUUID');
    }
	//#endregion
	
	//#region Deprecated mashup loader
	// *************************** MASHUP LOADER AND UTILITIES *****************************
	
	/**
	 * @deprecated Deprecated. Temporarily kept for compatibility.
	 */
	definitionForMashupNamed: ((name: string, args?: {atomic?: boolean, completionHandler?: any}) => BMCollectionViewDeserializedMashupEntityDefinition | Promise<BMCollectionViewDeserializedMashupEntityDefinition>) = BMCollectionViewDefinitionForMashupNamed;

	
	/**
	 * @override
	 * Invoked by the platform to remove this widget.
	 */
    destroy() {
        try {
            for (let widget of this.getWidgets()) widget.destroy();
		} 
		catch (err) {
		}
		
		// NOTE: The following unsupported features are not handled by Collection View's destructor:
		// * Tooltips
		// * Popups & Popup overlays
		// * jQuery element purging
		// * Unnecessary property deletions

		this.beforeDestroy();
		
		this.jqElement.remove();
		this.jqElement = <any>undefined;
    };

	/**
	 * Invoked by the platform when this widget is removed.
	 */
	beforeDestroy() {
		
		// Remove the style block if it was added
		if (this.hoverStyleBlock) this.hoverStyleBlock.remove();
		
		// Release the collection view, this will in turn destroy all the cells causing their associated mashups to be destroyed as well
		this.collectionView.release();

		// Standard TW beforeDestroy
		try {
			this.jqElement.unbind();
		}
		catch (e) {
			TW.log.error(e);
		}

		// Release the DirectLink connection if it was established
		if (this.getProperty('DirectLink')) {
			BMDirectLinkDisconnectWithDelegate(self);
		}
	};

}

// #endregion


// #region BMCollectionViewMenuController

@TWNamedRuntimeWidget('CollectionViewMenuController')
export class BMCollectionViewMenuController extends TWRuntimeWidget {

    renderHtml(): string {
        return '<div class="widget-content" style="display: none;"></div>';
    };
	
	afterRender() {
		this.boundingBox.css({display: 'none'});
		// Retain a reference to this menu controller. This will be used by the collection to fire the menu events.
        let mashup = this.mashup as BMCollectionViewMashup;
		mashup._BMCollectionViewMenuController = this;
	};
	
	serviceInvoked(name: string): void {
        let mashup = this.mashup as BMCollectionViewMashup;
		var cell = mashup._BMCell;
		var collectionView = mashup._BMCollectionView;
		var collectionViewController = mashup._BMCollectionViewController;	
		
		if (name === 'ExpandMenu') {
			collectionViewController.requestExpandMenuInCell(cell);
		}
		else if (name === 'CollapseMenu') {
			collectionViewController.requestCollapseMenuInCell(cell);
		}
		else if (name === 'ToggleMenu') {
			collectionViewController.requestToggleMenuInCell(cell);
		}
		else {
			collectionViewController.triggerEvent(name, {withCell: cell});
		}
		
    };
    
    beforeDestroy() {

    }

    updateProperty() {

    }
}

// #endregion


// #region BMCollectionViewSelectionController

@TWNamedRuntimeWidget('CollectionViewSelectionController')
export class BMCollectionViewSelectionController extends TWRuntimeWidget {

    renderHtml(): string {
        return '<div class="widget-content" style="display: none;"></div>';
    };
	
	afterRender() {
		this.boundingBox.css({display: 'none'});
	};
	
	serviceInvoked(name: string): void {
        let mashup = this.mashup as BMCollectionViewMashup;
		var cell = mashup._BMCell;
		var collectionView = mashup._BMCollectionView;
		var collectionViewController = mashup._BMCollectionViewController;	
		
		if (name === 'SelectCell') {
			if (!collectionView.isCellAtIndexPathSelected(cell.indexPath)) collectionView.selectCellAtIndexPath(cell.indexPath);
		}
		else if (name === 'DeselectCell') {
			if (collectionView.isCellAtIndexPathSelected(cell.indexPath)) collectionView.deselectCellAtIndexPath(cell.indexPath);
		}
		else if (name === 'ToggleSelection') {
			if (!collectionView.isCellAtIndexPathSelected(cell.indexPath)) {
				collectionView.selectCellAtIndexPath(cell.indexPath);
			}
			else {
				collectionView.deselectCellAtIndexPath(cell.indexPath);
			}
		}
		
    };
    
    beforeDestroy() {

    }

    updateProperty() {
        
    }
}

// #endregion

// #region BMCollectionViewSelectionController

@TWNamedRuntimeWidget('CollectionViewEditingController')
export class BMCollectionViewEditingController extends TWRuntimeWidget {

    renderHtml(): string {
        return '<div class="widget-content" style="display: none;"></div>';
    };
	
	afterRender() {
		this.boundingBox.css({display: 'none'});
	};
	
	serviceInvoked(name: string): void {
        let mashup = this.mashup as BMCollectionViewMashup;
		var cell = mashup._BMCell;
		var collectionView = mashup._BMCollectionView;
		var collectionViewController = mashup._BMCollectionViewController;	
		
		if (name === 'BeginEditing') {
			if (!collectionViewController.isCellAtIndexPathEditing(cell.indexPath)) collectionViewController.beginEditingCellAtIndexPath(cell.indexPath);
		}
		else if (name === 'FinishEditing') {
			if (collectionViewController.isCellAtIndexPathEditing(cell.indexPath)) collectionViewController.finishEditingCellAtIndexPath(cell.indexPath);
		}
		
    };
    
    beforeDestroy() {

    }

    updateProperty() {
        
    }
}

// #endregion

/**
 * Returns the widget with the specified id by searching the target mashup.
 * {
 * 	@param withId <String, nullable> 					Required if named is not specified. The ID of the widget to find
 * 	@param named <String, nullable>						The display name of the widget, if specified, the search will find the first widget 
 *														that has the specified id (if given) or the speficied display name.
 * 	@param inMashup <TWMashup>							The mashup object in which to search.
 * 	@param traverseContainedMashup <Boolean, nullable> 	Defaults to false. If set to true, the search will include other mashups contained within the source mashup.
 * }
 * @return <TWWidget, nullable> 						The actual widget object if found, null otherwise
 */
function BMFindWidget(args: {withId?: string, named?: string, inMashup: TWMashup, traverseContainedMashup?: boolean}) {
	var id = args.withId;
	var mashup = args.inMashup;
	var name = args.named;
	
	if (!mashup) mashup = TW.Runtime.Workspace.Mashups.Current;
	
	return BMFindWidgetRecursive(id, name, mashup.rootWidget, args.traverseContainedMashup);
}

function BMFindWidgetRecursive(id: string | undefined, name: string | undefined, container: any, includeContainedMashup?: boolean) {
	
	var widgets = container.getWidgets();
	var length = widgets.length;
	
	for (var i = 0; i < length; i++) {
		var widget = widgets[i];
		
		if (widget.idOfThisElement == id || widget.properties.Id == id) return widget;
		if (widget.properties.DisplayName == name) return widget;
		
		var subWidgets = widget.getWidgets();
		if (widget.properties.__TypeDisplayName == "Contained Mashup" && !includeContainedMashup) continue;
		if (subWidgets.length > 0) {
			widget = BMFindWidgetRecursive(id, name, widget, includeContainedMashup);
			
			if (widget) return widget;
		}
		
		
	}
	
	return null;
	
}
